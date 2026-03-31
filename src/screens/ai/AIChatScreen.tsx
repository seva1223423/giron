import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useThemeStore, useAuthStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ChatMessage } from '../../types';

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
      content: `Привет${user?.firstName ? `, ${user.firstName}` : ''}! Я твой ИИ-тренер в Iron Gym.\n\nЯ могу помочь с:\n• Составлением программы тренировок\n• Расчётом КБЖУ и питания\n• Техникой выполнения упражнений\n• Изменением текущего плана\n• Рекомендациями по восстановлению\n\nСпрашивай что угодно!`,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

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
      // TODO: Replace with actual API call to backend -> Claude API
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const aiResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: getAIMockResponse(text),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (e) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Извини, произошла ошибка. Попробуй ещё раз.',
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
          <View style={[styles.messageBubble, { alignSelf: 'flex-start', backgroundColor: colors.surface }]}>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Думаю...</Text>
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
              backgroundColor: input.trim() ? colors.primary : colors.inputBackground,
            },
          ]}
        >
          <Text style={{ color: input.trim() ? '#FFF' : colors.textTertiary, fontSize: 18, fontWeight: '700' }}>
            ↑
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

function getAIMockResponse(question: string): string {
  const q = question.toLowerCase();

  if (q.includes('программ') || q.includes('план')) {
    return `Отлично! Вот базовая программа на 4 дня в неделю (Push/Pull/Legs/Upper):\n\n📅 **День 1 — Push (грудь, плечи, трицепс)**\n• Жим штанги лёжа: 4×8-10\n• Жим гантелей на наклонной: 3×10-12\n• Жим стоя: 3×8-10\n• Махи в стороны: 3×12-15\n• Разгибания на блоке: 3×12-15\n\n📅 **День 2 — Pull (спина, бицепс)**\n• Становая тяга: 4×5\n• Тяга штанги в наклоне: 4×8-10\n• Подтягивания: 3×8-12\n• Сгибание рук со штангой: 3×10-12\n\n📅 **День 3 — Legs (ноги)**\n• Присед: 4×6-8\n• Жим ногами: 3×10-12\n• Румынская тяга: 3×10-12\n• Сгибание ног: 3×12\n• Подъём на носки: 4×15\n\n📅 **День 4 — Upper (верх тела)**\n• Жим гантелей лёжа: 4×10\n• Тяга верхнего блока: 4×10\n• Жим Арнольда: 3×10\n• Суперсет: бицепс + трицепс 3×12\n\nХочешь, чтобы я сохранил эту программу?`;
  }

  if (q.includes('легче') || q.includes('проще')) {
    return 'Понял, сделаю нагрузку легче! Вот что предлагаю:\n\n1. Снизить рабочие веса на 10-15%\n2. Уменьшить количество подходов с 4 до 3\n3. Увеличить время отдыха до 2-3 минут\n4. Убрать изолирующие упражнения\n\nПрименить эти изменения к текущей программе?';
  }

  if (q.includes('присед') || q.includes('squat')) {
    return '🏋️ **Техника приседа со штангой:**\n\n1. **Исходная позиция**: Стопы на ширине плеч, носки развёрнуты на 15-30°\n2. **Штанга**: На верхней части трапеций (high bar) или на задних дельтах (low bar)\n3. **Движение вниз**: Начинай с отведения таза назад, колени идут в сторону носков\n4. **Глубина**: До параллели бёдер с полом или чуть ниже\n5. **Движение вверх**: Давите пятками в пол, грудь вперёд\n\n⚠️ **Частые ошибки:**\n• Колени заваливаются внутрь\n• Округление спины\n• Подъём на носки\n• Слишком быстрое опускание\n\nХочешь видео или дополнительные советы?';
  }

  if (q.includes('кбжу') || q.includes('калор') || q.includes('питан')) {
    return '📊 Рассчитаю КБЖУ! Для точного расчёта мне нужны:\n\n• Твой вес: из профиля\n• Рост: из профиля\n• Уровень активности\n• Цель (похудение / набор / поддержание)\n\nПриблизительный расчёт для мужчины 75 кг, цель — набор мышечной массы:\n\n🔥 **Калории**: ~2800 ккал/день\n🥩 **Белки**: 150-180 г (2-2.4 г/кг)\n🧈 **Жиры**: 75-85 г (1 г/кг)\n🍚 **Углеводы**: 350-400 г\n\nХочешь, чтобы я установил эти цели в твоём дневнике питания?';
  }

  if (q.includes('бол') || q.includes('травм') || q.includes('спин')) {
    return '⚠️ Если у тебя болит спина, важно:\n\n1. **Прекратить** упражнения, которые вызывают боль\n2. **Обратиться к врачу** при сильной или длительной боли\n\nЧто я могу сделать:\n• Убрать становую тягу и тяжёлые тяги\n• Заменить приседания на жим ногами\n• Добавить упражнения на укрепление кора\n• Рекомендовать растяжку для поясницы\n\nУбрать нагрузку на спину из текущей программы?';
  }

  if (q.includes('замен')) {
    return 'Вот альтернативы жиму штанги лёжа:\n\n1. **Жим гантелей лёжа** — больше амплитуда, работа стабилизаторов\n2. **Жим в тренажёре Смита** — безопаснее, не нужен страхующий\n3. **Отжимания на брусьях** — отличное базовое упражнение\n4. **Жим в Hammer Strength** — хорошая изоляция груди\n5. **Отжимания от пола с утяжелением** — работает везде\n\nКакой вариант тебе подходит больше?';
  }

  return 'Отличный вопрос! Я готов помочь тебе с тренировками, питанием, техникой упражнений и восстановлением. Расскажи подробнее, что тебя интересует, и я дам детальный ответ с учётом твоего уровня подготовки и целей.';
}

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
