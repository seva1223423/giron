import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const FEATURES = [
  { icon: '◈', title: 'Iron Coach без ограничений', free: '10 сообщений/день', pro: 'Безлимитно' },
  { icon: '◧', title: 'Расширенная аналитика', free: 'Базовая', pro: 'Полная + тренды' },
  { icon: '◫', title: 'Готовые программы', free: '3 шаблона', pro: '20+ программ' },
  { icon: '◑', title: 'КБЖУ сканер фото', free: '5 сканов/день', pro: 'Безлимитно' },
  { icon: '◉', title: 'Клубный лидерборд', free: 'Просмотр', pro: 'Участие + рекорды' },
  { icon: '◎', title: 'Динамика 1ПМ', free: 'Последние 10', pro: 'Полная история' },
  { icon: '◈', title: 'Приоритетный AI-ответ', free: '—', pro: 'Есть' },
  { icon: '◉', title: 'Умные напоминания', free: 'Базовые', pro: 'Персонализированные' },
];

export const FeaturesTable: React.FC = () => {
  const colors = useThemeColors();

  return (
    <Card style={{ marginTop: spacing.xxl }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Что входит в Pro</Text>
      <View style={[styles.row, { borderBottomWidth: 2, borderBottomColor: colors.border, paddingBottom: spacing.sm }]}>
        <View style={{ flex: 1 }} />
        <Text style={[typography.captionMedium, { color: colors.textSecondary, width: 60, textAlign: 'center' }]} numberOfLines={1} allowFontScaling={false}>Бесплатно</Text>
        <View style={[styles.proHeader, { backgroundColor: colors.accent }]}>
          <Text style={[typography.captionMedium, { color: colors.textInverse, width: 52, textAlign: 'center' }]} allowFontScaling={false}>Pro</Text>
        </View>
      </View>
      {FEATURES.map((f, i) => (
        <View key={i} style={[styles.row, { paddingVertical: spacing.md }, i < FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>{f.icon}</Text>
            <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={2}>{f.title}</Text>
          </View>
          <Text style={[typography.small, { color: colors.textTertiary, width: 60, textAlign: 'center', fontSize: 10 }]} numberOfLines={2} adjustsFontSizeToFit>{f.free}</Text>
          <Text style={[typography.small, { color: colors.accent, width: 52, textAlign: 'center', fontWeight: '700', fontSize: 10 }]} numberOfLines={2} adjustsFontSizeToFit>{f.pro}</Text>
        </View>
      ))}
    </Card>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  proHeader: { width: 52, borderRadius: borderRadius.sm, paddingVertical: 3, alignItems: 'center' },
});
