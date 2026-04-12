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
          : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
      ]}>
        {!isUser && (
          <View style={styles.coachHeader}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.primary + '60', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>IC</Text></View>
            <Text style={[typography.captionMedium, { color: colors.primary, fontWeight: '700' }]}>Iron Coach</Text>
          </View>
        )}
        <Text style={[
          styles.messageText,
          { color: isUser ? '#FFF' : colors.text },
        ]}>
          {message.content}
        </Text>
        <View style={styles.footer}>
          <Text style={[styles.time, { color: isUser ? 'rgba(255,255,255,0.5)' : colors.textTertiary }]}>
            {new Date(message.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {!isUser && message.content.length > 0 && onSpeak && (
            <TouchableOpacity
              onPress={() => onSpeak(message.id, message.content)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.speakButton}
            >
              <Text style={{ fontSize: 14 }}>{isSpeaking ? 'OFF' : 'ON'}</Text>
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
