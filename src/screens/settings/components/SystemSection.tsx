import React from 'react';
import { Text, Switch, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

  const handleExport = async () => {
    try {
      const [workouts, auth, nutrition, settings] = await Promise.all([
        AsyncStorage.getItem('iron-gym-workouts'),
        AsyncStorage.getItem('iron-gym-auth'),
        AsyncStorage.getItem('iron-gym-nutrition'),
        AsyncStorage.getItem('iron-gym-settings'),
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        workouts: workouts ? JSON.parse(workouts) : null,
        auth: auth ? JSON.parse(auth) : null,
        nutrition: nutrition ? JSON.parse(nutrition) : null,
        settings: settings ? JSON.parse(settings) : null,
      };
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'Iron Gym Backup' });
    } catch {
      // Silently fail
    }
  };

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
        <SettingRow
          label="Экспорт данных"
          sublabel="JSON бэкап всех данных"
          divider
          onPress={handleExport}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />
      </Card>
    </FadeIn>
  );
};
