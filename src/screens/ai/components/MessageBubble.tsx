import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { ChatMessage } from '../../../types';

interface Props {
  message: ChatMessage;
  isLast: boolean;
}

export const MessageBubble: React.FC<Props> = ({ message, isLast }) => {
  const { colors } = useThemeStore();
  const isUser = message.role === 'user';

  return (
    <FadeIn delay={isLast ? 100 : 0}>
      <View style={[
        styles.bubble,
        isUser
          ? { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 }
          : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
      ]}>
        {!isUser && (
          <Text style={[typography.captionMedium, { color: colors.primary, marginBottom: 4 }]}>Iron Coach</Text>
        )}
        <Text style={[typography.body, { color: isUser ? '#FFF' : colors.text, lineHeight: 22 }]}>
          {message.content}
        </Text>
        <Text style={[typography.small, { color: isUser ? 'rgba(255,255,255,0.5)' : colors.textTertiary, textAlign: 'right', marginTop: 4, fontSize: 10 }]}>
          {new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.md },
});
