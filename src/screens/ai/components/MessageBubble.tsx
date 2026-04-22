import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { FadeIn, Icon } from '../../../components';
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

  // Direction A bubble radii — the corner on the "speaker" side pinches
  // to 4pt so the bubble reads as a speech balloon:
  //   user  → bottom-right pinched (18/18/4/18)
  //   coach → bottom-left pinched  (18/18/18/4)
  const bubbleRadius = isUser
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 }
    : { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 };

  return (
    <FadeIn delay={isLast ? 100 : 0}>
      <View
        style={[
          styles.bubble,
          bubbleRadius,
          isUser
            ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
            : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        ]}
      >
        <Text
          style={[styles.messageText, { color: isUser ? colors.textInverse : colors.text }]}
        >
          {message.content}
        </Text>
        <View style={styles.footer}>
          <Text
            style={[
              styles.time,
              {
                color: isUser ? colors.textInverse : colors.textTertiary,
                opacity: isUser ? 0.5 : 1,
              },
            ]}
          >
            {new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {!isUser && message.content.length > 0 && onSpeak && (
            <TouchableOpacity
              onPress={() => onSpeak(message.id, message.content)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.speakButton}
              accessibilityLabel={isSpeaking ? 'Выключить озвучку' : 'Озвучить сообщение'}
              accessibilityRole="button"
            >
              <Icon name={isSpeaking ? 'pause' : 'play'} size={12} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </FadeIn>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '82%',
    padding: spacing.md + 2,
    borderRadius: borderRadius.lg + 2,
    marginBottom: spacing.md,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  time: {
    fontSize: 10,
    flex: 1,
    textAlign: 'right',
  },
  speakButton: { paddingLeft: 4 },
});
