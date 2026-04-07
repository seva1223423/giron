import React from 'react';
import { Text, Switch, TouchableOpacity, View } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';

const THEME_OPTIONS = [
  { value: 'light' as const, label: '☀️ Светлая' },
  { value: 'dark' as const, label: '🌙 Тёмная' },
  { value: 'auto' as const, label: '🌓 Авто' },
];

export const AppearanceSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors, mode, setMode } = useThemeStore();
  return (
    <FadeIn delay={0}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md, letterSpacing: 0.5 }]}>ВНЕШНИЙ ВИД</Text>
        <Text style={[typography.small, { color: colors.textTertiary, marginBottom: spacing.sm }]}>Тема</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {THEME_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { haptic.selection(); setMode(opt.value); }}
              style={{
                flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5, alignItems: 'center',
                backgroundColor: mode === opt.value ? colors.primary + '15' : colors.surface,
                borderColor: mode === opt.value ? colors.primary : colors.border,
              }}
            >
              <Text style={[typography.captionMedium, { color: mode === opt.value ? colors.primary : colors.textSecondary }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'auto' && (
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
            Тёмная с 21:00 до 7:00, светлая в остальное время
          </Text>
        )}
      </Card>
    </FadeIn>
  );
};
