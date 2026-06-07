import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

export const TypingIndicator: React.FC = () => {
  const colors = useThemeColors();
  return (
    <FadeIn delay={0}>
      <View style={[styles.bubble, { backgroundColor: colors.surface }]}>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.7 }]} />
          <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.4 }]} />
        </View>
        <Text style={[typography.small, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
          Iron Coach думает...
        </Text>
      </View>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  bubble: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.md },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
