import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useAuthStore } from '../../store';
import { FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ChatMessage } from '../../types';
import { aiService, getApiError } from '../../services';

const QUICK_PROMPTS = [
  { emoji: '💪', text: 'Составь программу тренировок' },
  { emoji: '🍽', text: 'Рассчитай мне КБЖУ' },
  { emoji: '🏋️', text: 'Как правильно делать присед?' },
  { emoji: '🔄', text: 'Чем заменить жим лёжа?' },
  { emoji: '📋', text: 'Составь рацион на день' },
  { emoji: '⚡', text: 'Я застрял на плато — что делать?' },
  { emoji: '🤕', text: 'У меня болит спина при тяге' },
  { emoji: '💊', text: 'Какие добавки реально работают?' },
  { emoji: '🌙', text: 'Как улучшить восстановление?' },
  { emoji: '🎯', text: 'Как одновременно худеть и качаться?' },
];

export const AIChatScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Привет${user?.firstName ? `, ${user.firstName}` : ''}! Я Iron Coach — твой персональный ИИ-тренер.\n\nМои знания основаны на научных исследованиях и опыте лучших тренеров мира. Я могу помочь с:\n\n🏋️ Программами тренировок под твои цели\n🍽 Расчётом питания и составлением рациона\n📐 Техникой выполнения упражнений\n💪 Прогрессивной перегрузкой и периодизацией\n🔬 Научно обоснованными рекомендациями\n🌙 Восстановлением и профилактикой травм\n\nВыбери вопрос ниже или спроси своё!`,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load chat history from server
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await aiService.getChatHistory();
        if (history.length > 0) {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: `С возвращением${user?.firstName ? `, ${user.firstName}` : ''}! Продолжим работу. Спрашивай что угодно.`,
              createdAt: new Date().toISOString(),
            },
            ...history,
          ]);
        }
      } catch {
        // If server is unavailable, keep welcome message
      } finally {
        setHistoryLoaded(true);
      }
    };
    loadHistory();
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const response = await aiService.chat(text.trim());

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const aiResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (e) {
      const apiError = getApiError(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: apiError.status === 0
          ? 'Нет подключения к серверу. Проверь, что сервер запущен и доступен.'
          : `Ошибка: ${apiError.message}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const showQuickPrompts = messages.length <= 1;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={[typography.h3, { color: colors.text }]}>Iron Coach</Text>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
          </View>
          <Text style={[typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
            Персональный ИИ-тренер
          </Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg, index) => (
          <FadeIn key={msg.id} delay={index === messages.length - 1 ? 100 : 0}>
            <View
              style={[
                styles.messageBubble,
                msg.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 }
                  : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
              ]}
            >
              {msg.role === 'assistant' && (
                <Text style={[typography.captionMedium, { color: colors.primary, marginBottom: 4 }]}>
                  Iron Coach
                </Text>
              )}
              <Text
                style={[
                  typography.body,
                  {
                    color: msg.role === 'user' ? '#FFF' : colors.text,
                    lineHeight: 22,
                  },
                ]}
              >
                {msg.content}
              </Text>
              <Text
                style={[
                  typography.small,
                  {
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.5)' : colors.textTertiary,
                    textAlign: 'right',
                    marginTop: 4,
                    fontSize: 10,
                  },
                ]}
              >
                {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </FadeIn>
        ))}

        {/* Quick prompts (only if few messages) */}
        {showQuickPrompts && (
          <FadeIn delay={200}>
            <View style={styles.quickPrompts}>
              {QUICK_PROMPTS.map((prompt, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => sendMessage(prompt.text)}
                  style={[styles.quickPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={{ fontSize: 16, marginRight: spacing.xs }}>{prompt.emoji}</Text>
                  <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{prompt.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FadeIn>
        )}

        {isTyping && (
          <FadeIn delay={0}>
            <View style={[styles.messageBubble, styles.typingBubble, { backgroundColor: colors.surface }]}>
              <View style={styles.typingDots}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.7 }]} />
                <View style={[styles.dot, { backgroundColor: colors.primary, opacity: 0.4 }]} />
              </View>
              <Text style={[typography.small, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
                Iron Coach думает...
              </Text>
            </View>
          </FadeIn>
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
              color: colors.inputText,
            },
          ]}
          value={input}
          onChangeText={setInput}
          placeholder="Спроси что-нибудь..."
          placeholderTextColor={colors.inputPlaceholder}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
          style={[
            styles.sendBtn,
            {
              backgroundColor: input.trim() && !isTyping ? colors.primary : colors.inputBackground,
            },
          ]}
        >
          <Text style={{ color: input.trim() && !isTyping ? '#FFF' : colors.textTertiary, fontSize: 18, fontWeight: '700' }}>
            {'↑'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  messagesContainer: {
    padding: spacing.xl,
    paddingBottom: spacing.lg,
  },
  quickPrompts: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  typingBubble: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: 16,
    marginRight: spacing.sm,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
