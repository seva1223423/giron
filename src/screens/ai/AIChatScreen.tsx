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
import { useThemeStore, useAuthStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ChatMessage } from '../../types';
import { aiService, getApiError } from '../../services';

const QUICK_PROMPTS = [
  'Составь программу на 4 дня',
  'Сделай тренировку легче',
  'Как правильно делать присед?',
  'Рассчитай мне КБЖУ',
  'Чем заменить жим лёжа?',
  'У меня болит спина',
];

export const AIChatScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Привет${user?.firstName ? `, ${user.firstName}` : ''}! Я твой ИИ-тренер в Iron Gym.\n\nЯ могу помочь с:\n\u2022 Составлением программы тренировок\n\u2022 Расчётом КБЖУ и питания\n\u2022 Техникой выполнения упражнений\n\u2022 Изменением текущего плана\n\u2022 Рекомендациями по восстановлению\n\nСпрашивай что угодно!`,
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
              content: `С возвращением${user?.firstName ? `, ${user.firstName}` : ''}! Продолжим?`,
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

      const aiResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (e) {
      const apiError = getApiError(e);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: apiError.status === 0
          ? 'Нет подключения к серверу. Проверь, что сервер запущен.'
          : `Ошибка: ${apiError.message}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[typography.h3, { color: colors.text }]}>ИИ-Тренер</Text>
        <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Quick prompts (only if few messages) */}
        {messages.length <= 1 && (
          <View style={styles.quickPrompts}>
            {QUICK_PROMPTS.map((prompt) => (
              <TouchableOpacity
                key={prompt}
                onPress={() => sendMessage(prompt)}
                style={[styles.quickPrompt, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[typography.small, { color: colors.text }]}>{prompt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.messageBubble,
              msg.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                : { alignSelf: 'flex-start', backgroundColor: colors.surface },
            ]}
          >
            <Text
              style={[
                typography.body,
                { color: msg.role === 'user' ? '#FFF' : colors.text },
              ]}
            >
              {msg.content}
            </Text>
          </View>
        ))}

        {isTyping && (
          <View style={[styles.messageBubble, styles.typingBubble, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[typography.body, { color: colors.textSecondary, marginLeft: spacing.sm }]}>
              Думаю...
            </Text>
          </View>
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
          maxLength={1000}
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
            ↑
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickPrompt: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
    maxHeight: 100,
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
