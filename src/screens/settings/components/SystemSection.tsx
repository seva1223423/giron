import React from 'react';
import { Text, Switch } from 'react-native';
import { useThemeStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';
import { useHaptic } from '../../../hooks/useHaptic';

export const SystemSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { hapticFeedback, setHapticFeedback } = useSettingsStore();

  return (
    <FadeIn delay={240}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>СИСТЕМА</Text>
        <SettingRow
          label="Тактильный отклик"
          right={
            <Switch
              value={hapticFeedback}
              onValueChange={(v) => { if (v) haptic.selection(); setHapticFeedback(v); }}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={hapticFeedback ? colors.primary : '#f4f3f4'}
            />
          }
        />
        <SettingRow
          label="Язык"
          sublabel="Русский"
          divider
          right={<Text style={[typography.body, { color: colors.textSecondary }]}>Русский</Text>}
        />
      </Card>
    </FadeIn>
  );
};
