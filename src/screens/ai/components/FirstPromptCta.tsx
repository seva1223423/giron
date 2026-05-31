import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

/**
 * Activation CTA shown on AIChatScreen when the user has registered but
 * never sent a single AI message (firstChatAt is null on the User row).
 *
 * Why this exists: the metrics dashboard showed activation 20% (1/5
 * registrations chatted within 24h). The wall of 12 quick prompts +
 * 200-word welcome message creates choice paralysis right when the user
 * is least committed. A single high-confidence CTA with a known-good
 * starter prompt converts better than free choice for first-time users.
 *
 * The card disappears the moment the user sends their first message
 * (firstChatAt becomes non-null on the next profile fetch). For returning
 * users with chat history it never shows.
 */
interface Props {
  onPress: () => void;
}

export const FirstPromptCta: React.FC<Props> = ({ onPress }) => {
  const colors = useThemeColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.container,
        {
          backgroundColor: colors.primary + '15',
          borderColor: colors.primary + '50',
        },
      ]}
      accessibilityLabel="Получить первую программу тренировок"
      accessibilityRole="button"
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: colors.primary, shadowColor: colors.primary },
        ]}
      >
        <Icon name="spark" size={22} color={colors.textInverse} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodySemibold, { color: colors.text }]}>
          Получи первую программу
        </Text>
        <Text
          style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
        >
          Iron Coach составит план под твои цели за 30 секунд
        </Text>
      </View>
      <Icon name="arrow" size={20} color={colors.primary} strokeWidth={2.2} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    marginBottom: spacing.lg,
    // Subtle elevation so the CTA reads as the primary action without
    // being a full-bleed banner that fights the chat layout below.
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
});
