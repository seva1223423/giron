import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { ChatMessage } from '../../../types';

interface Props {
  message: ChatMessage;
  isLast: boolean;
  speakingId?: string | null;
  onSpeak?: (id: string, text: string) => void;
}

export const MessageBubble: React.FC<Props> = ({ message, isLast, speakingId, onSpeak }) => {
  const { colors } = useThemeStore();
  const isUser = message.role === 'user';
  const isSpeaking = speakingId === message.id;

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
        <View style={styles.footer}>
          <Text style={[typography.small, { color: isUser ? 'rgba(255,255,255,0.5)' : colors.textTertiary, fontSize: 10, flex: 1, textAlign: 'right' }]}>
            {new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {!isUser && message.content.length > 0 && onSpeak && (
            <TouchableOpacity
              onPress={() => onSpeak(message.id, message.content)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.speakButton}
            >
              <Text style={{ fontSize: 14 }}>{isSpeaking ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.md },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  speakButton: { paddingLeft: 4 },
});
