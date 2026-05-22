import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
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
  /** True when this bubble is the live streaming response. Draws a
   *  blinking gold cursor at the end of the text so the user knows
   *  the trainer is still talking. */
  isStreaming?: boolean;
}

export const MessageBubble: React.FC<Props> = ({ message, isLast, speakingId, onSpeak, isStreaming }) => {
  const { colors } = useThemeStore();
  const isUser = message.role === 'user';
  const isSpeaking = speakingId === message.id;

  // Streaming cursor — pulses opacity 1 → 0 while the model emits chunks.
  // Direction A signature: gold accent, soft 600ms breathing rhythm.
  const cursorOpacity = useSharedValue(1);
  useEffect(() => {
    if (isStreaming) {
      cursorOpacity.value = withRepeat(
        withTiming(0, { duration: 600 }),
        -1,
        true,
      );
    } else {
      cancelAnimation(cursorOpacity);
      cursorOpacity.value = 0;
    }
  }, [isStreaming]);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  // Direction A bubble radii — the corner on the "speaker" side pinches
  // to 4pt so the bubble reads as a speech balloon:
  //   user  → bottom-right pinched (18/18/4/18)
  //   coach → bottom-left pinched  (18/18/18/4)
  const bubbleRadius = isUser
    ? { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 4, borderBottomLeftRadius: 18 }
    : { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4 };

  return (
    <FadeIn delay={isLast ? 100 : 0}>
      {/* Iron Coach mini-header — brand voice on every AI bubble so the user
          reads it as "from the trainer", not generic text. Hidden on user
          messages (no need to label yourself to yourself). */}
      {!isUser && (
        <View style={styles.coachHeader}>
          <View
            style={[
              styles.coachBadge,
              {
                backgroundColor: colors.primary + '20',
                borderColor: colors.primary + '40',
              },
            ]}
          >
            <Icon name="spark" size={10} color={colors.primary} />
          </View>
          <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>IRON COACH</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          bubbleRadius,
          isUser
            ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
            : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
        ]}
      >
        <Text style={[typography.body, { color: isUser ? colors.textInverse : colors.text }]}>
          {message.content}
          {isStreaming && !isUser && (
            <Animated.Text style={[typography.body, { color: colors.primary }, cursorStyle]}>
              ▊
            </Animated.Text>
          )}
        </Text>
        <View style={styles.footer}>
          <Text
            style={[
              typography.caption,
              {
                color: isUser ? colors.textInverse : colors.textTertiary,
                opacity: isUser ? 0.5 : 1,
                flex: 1,
                textAlign: 'right',
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
          {/* Share button on assistant messages — long programs and
              meal plans are exactly the kind of content users send to
              friends ("look at the plan AI made for me"). Sharing seeds
              an organic growth loop: each share is a free impression
              with a strong implicit endorsement. Skipped on user
              messages because nobody shares their own questions, and
              short messages (<40 chars) because a one-liner like
              "понял, спасибо" isn't worth a share-sheet. */}
          {!isUser && message.content.length > 40 && (
            <TouchableOpacity
              onPress={() => {
                Share.share({
                  message: `${message.content}\n\n— Iron Coach (Giron)\nhttps://giron.app`,
                }).catch(() => {});
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.speakButton}
              accessibilityLabel="Поделиться сообщением"
              accessibilityRole="button"
            >
              <Icon name="send" size={12} color={colors.primary} />
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
    gap: spacing.xs,
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
  },
  coachBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  speakButton: { paddingLeft: 4 },
});
