import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors } from '../../store';
import { FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import {
  AppearanceSection, WorkoutSection,
  NotificationsSection, SystemSection, LegalSection,
} from './components';

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const colors = useThemeColors();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Настройки</Text>
        </View>
      </View>

      <AppearanceSection />
      {/* UnitsSection removed (audit R38): the kg/lb switch stored a value that
          nothing ever read — no conversion happened on weight entry, history,
          records or measurements, so the setting was purely decorative. The app
          targets the Russian market, so metric-only is the honest state until
          real conversion is implemented. */}
      <WorkoutSection />
      <NotificationsSection />
      <SystemSection />
      <LegalSection />

      <FadeIn delay={300}>
        <View style={styles.appInfo}>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>Giron</Text>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>Версия 1.0.0</Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  appInfo: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xl },
});
