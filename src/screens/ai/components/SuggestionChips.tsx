import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { spacing } from '../../../theme/spacing';

interface Props {
  /** 3–5 short prompts displayed as horizontal scroll chips just above
   *  the input bar. Parent supplies them so they can be context-aware
   *  (e.g. "План на завтра" right after a workout summary). */
  prompts: string[];
  onSend: (text: string) => void;
}

/**
 * Compact horizontal suggestion-chip row copied 1:1 from the Direction
 * A chat design (A_AI). Sits just above the ChatInputBar and always-on,
 * versus the bigger QuickPromptsList which only shows on the empty
 * state.
 *
 *   "План на завтра" "Мой прогресс за месяц" "Посчитать КБЖУ"
 *
 * Each chip: surface bg, border, 8/12 padding, 12pt radius, small
 * muted-secondary text. Tap sends the text verbatim as a user message.
 * Accessible as buttons with the prompt in the label.
 */
export const SuggestionChips: React.FC<Props> = ({ prompts, onSend }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  if (prompts.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {prompts.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => { haptic.selection(); onSend(p); }}
            accessibilityLabel={`Подсказка: ${p}`}
            accessibilityRole="button"
            style={[
              styles.chip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                fontWeight: '500',
              }}
              numberOfLines={1}
            >
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  row: {
    gap: 6,
    paddingVertical: 4,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
