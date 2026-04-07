import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../store';
import { FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import {
  AppearanceSection, UnitsSection, WorkoutSection,
  NotificationsSection, SystemSection,
} from './components';

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
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
      <UnitsSection />
      <WorkoutSection />
      <NotificationsSection />
      <SystemSection />

      <FadeIn delay={300}>
        <View style={styles.appInfo}>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>Iron Gym</Text>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>Версия 1.0.0</Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  appInfo: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xl },
});
