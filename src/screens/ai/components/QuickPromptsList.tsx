import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Prompt {
  emoji: string;
  text: string;
}

interface Props {
  dynamicPrompts: Prompt[];
  allPrompts: Prompt[];
  hasServerStarters: boolean;
  onSend: (text: string) => void;
}

export const QuickPromptsList: React.FC<Props> = ({ dynamicPrompts, allPrompts, hasServerStarters, onSend }) => {
  const { colors } = useThemeStore();

  return (
    <FadeIn delay={200}>
      <View style={styles.container}>
        {dynamicPrompts.length > 0 && (
          <Text style={[typography.captionMedium, { color: colors.textTertiary, marginBottom: spacing.xs, marginLeft: 2 }]}>
            ДЛЯ ТЕБЯ
          </Text>
        )}
        {allPrompts.map((prompt, i) => (
          <React.Fragment key={i}>
            {i === dynamicPrompts.length && dynamicPrompts.length > 0 && (
              <Text style={[typography.captionMedium, { color: colors.textTertiary, marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: 2 }]}>
                {hasServerStarters ? 'РЕКОМЕНДАЦИИ' : 'ПОПУЛЯРНЫЕ ВОПРОСЫ'}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => onSend(prompt.text)}
              style={[
                styles.prompt,
                { backgroundColor: colors.surface, borderColor: colors.border },
                i < dynamicPrompts.length && { borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' },
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, marginRight: spacing.xs }}>{prompt.emoji}</Text>
              <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={2}>{prompt.text}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.sm, marginBottom: spacing.xl },
  prompt: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.lg, borderWidth: 1 },
});
