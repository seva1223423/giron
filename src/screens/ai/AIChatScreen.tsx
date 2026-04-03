import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useAuthStore, useWorkoutStore, useSubscriptionStore, FREE_LIMITS, useNutritionStore } from '../../store';
import { FadeIn, PaywallModal } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ChatMessage } from '../../types';
import { aiService, getApiError, AIActionResult, AIMeta, AIStarter } from '../../services';

const FALLBACK_PROMPTS = [
  { emoji: '💪', text: 'Составь программу тренировок под мои цели' },
  { emoji: '🍽', text: 'Рассчитай мне КБЖУ и составь рацион' },
  { emoji: '🏋️', text: 'Как правильно делать становую тягу?' },
  { emoji: '🏠', text: 'Программа тренировок дома без оборудования' },
  { emoji: '📋', text: 'Составь рацион на день для похудения' },
  { emoji: '⚡', text: 'Я застрял на плато — как пробить?' },
  { emoji: '🔬', text: 'Какие добавки реально работают по науке?' },
  { emoji: '🌙', text: 'Как оптимизировать сон и восстановление?' },
  { emoji: '🎯', text: 'Как одновременно худеть и набирать мышцы?' },
  { emoji: '🧠', text: 'Как не бросить тренировки и держать мотивацию?' },
  { emoji: '🏃', text: 'Как совмещать кардио и силовые?' },
  { emoji: '🤕', text: 'Болит плечо при жиме — что делать?' },
];

function getRecoveryColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 60) return '#FF9800';
  if (score >= 40) return '#FF5722';
  return '#F44336';
}

function getRecoveryLabel(score: number): string {
  if (score >= 80) return 'Отличное';
  if (score >= 60) return 'Хорошее';
  if (score >= 40) return 'Среднее';
  return 'Низкое';
}

export const AIChatScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user, fetchProfile } = useAuthStore();
  const { workoutHistory, fetchHistory, fetchPrograms, programs, setWeekPlanDay, weekPlan } = useWorkoutStore();
  const { setTargets, syncMealsFromServer, defaultTargets, getDayLog, addWater } = useNutritionStore();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Привет${user?.firstName ? `, ${user.firstName}` : ''}! Я Iron Coach — твой персональный ИИ-тренер.\n\nМоя база знаний основана на 50+ научных исследованиях и работах лучших экспертов мира (Schoenfeld, Helms, Israetel, Nuckols, Aragon и др.).\n\nЯ могу помочь с:\n\n🏋️ Программы тренировок (зал, дом, любой уровень)\n🍽 Питание и КБЖУ — расчёт и составление рациона\n📐 Техника — детальный разбор любого упражнения\n🔬 Наука — физиология мышц, гормоны, биомеханика\n🏃 Кардио — HIIT, LISS, совмещение с силовыми\n🌙 Восстановление — сон, стресс, профилактика травм\n💊 Добавки — что работает, а что маркетинг\n🧠 Мотивация — привычки, цели, преодоление плато\n\nВыбери вопрос ниже или спроси своё!`,
      createdAt: new Date().toISOString(),
    },
  ]);
  const { consumeAiMessage, aiMessagesLeft, isPremiumActive } = useSubscriptionStore();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [lastActions, setLastActions] = useState<AIActionResult[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [lastMeta, setLastMeta] = useState<AIMeta | null>(null);
  const [serverStarters, setServerStarters] = useState<AIStarter[]>([]);
  const [celebration, setCelebration] = useState<{ milestones: string[]; prs: string[] } | null>(null);

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

  // Load personalized starters from server
  useEffect(() => {
    aiService.getStarters().then((starters) => {
      if (starters.length > 0) setServerStarters(starters);
    });
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Check daily limit for free users
    const allowed = consumeAiMessage();
    if (!allowed) {
      haptic.warning();
      setShowPaywall(true);
      return;
    }

    haptic.light();

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
      const todayDate = new Date().toISOString().split('T')[0];
      const todayLog = getDayLog(todayDate);
      const nutritionTargets = {
        calories: todayLog.targetCalories,
        protein: todayLog.targetProtein,
        fats: todayLog.targetFats ?? defaultTargets.fats,
        carbs: todayLog.targetCarbs ?? defaultTargets.carbs,
        waterTargetMl: todayLog.waterTargetMl ?? defaultTargets.waterTargetMl,
      };
      const response = await aiService.chat(text.trim(), nutritionTargets, todayLog.waterMl, weekPlan);

      haptic.success();

      // Capture AI metadata
      if (response.meta) {
        setLastMeta(response.meta);
        const celebrationData: { milestones: string[]; prs: string[] } = {
          milestones: response.meta.milestones ?? [],
          prs: response.meta.newPRs ?? [],
        };
        if (celebrationData.milestones.length > 0 || celebrationData.prs.length > 0) {
          setCelebration(celebrationData);
          setTimeout(() => setCelebration(null), 8000);
        }
      }

      if (response.actions?.length > 0) {
        setLastActions(response.actions);
        setTimeout(() => setLastActions([]), 6000);

        // Sync local stores after AI actions
        const actionTypes = response.actions.map((a) => a.type);
        if (actionTypes.includes('create_workout') || actionTypes.includes('modify_workout') || actionTypes.includes('create_program')) {
          fetchPrograms().catch(() => {});
          fetchHistory().catch(() => {});
        }
        if (actionTypes.includes('update_user_profile') || actionTypes.includes('log_body_weight')) {
          fetchProfile().catch(() => {});
        }
        if (actionTypes.includes('log_meal') || actionTypes.includes('delete_meal')) {
          const today = new Date().toISOString().split('T')[0];
          syncMealsFromServer(today).catch(() => {});
        }
        if (actionTypes.includes('log_water')) {
          const action = response.actions.find((a) => a.type === 'log_water');
          if (action?.data?.ml) {
            const today = new Date().toISOString().split('T')[0];
            addWater(today, action.data.ml as number);
          }
        }
        if (actionTypes.includes('update_nutrition_targets')) {
          const action = response.actions.find((a) => a.type === 'update_nutrition_targets');
          if (action?.data) {
            const today = new Date().toISOString().split('T')[0];
            setTargets(today, {
              calories: action.data.calories as number,
              protein: action.data.protein as number,
              fats: action.data.fats as number,
              carbs: action.data.carbs as number,
            });
          }
        }
        if (actionTypes.includes('set_weekly_plan')) {
          const action = response.actions.find((a) => a.type === 'set_weekly_plan');
          const schedule = action?.data?.schedule as Array<{ dayIndex: number; workoutName: string; emoji: string; exerciseIds: string[] }> | undefined;
          if (schedule) {
            schedule.forEach((day) => {
              setWeekPlanDay(day.dayIndex, {
                name: day.workoutName,
                emoji: day.emoji || '🏋️',
                exercises: day.exerciseIds,
              });
            });
          }
        }
      }

      const aiResponse: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (e) {
      const apiError = getApiError(e);
      haptic.error();
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

  // Dynamic prompts based on recent workout data
  const dynamicPrompts = useMemo(() => {
    const prompts: { emoji: string; text: string }[] = [];

    // Modify-workout prompts if user has an active program with workouts
    const activeProgram = programs.find((p) => p.isActive);
    if (activeProgram && activeProgram.workouts && activeProgram.workouts.length > 0) {
      const firstWorkout = activeProgram.workouts[0];
      prompts.push({ emoji: '🔄', text: `Сделай тренировку "${firstWorkout.name}" немного легче` });
      prompts.push({ emoji: '✂️', text: `Убери одно упражнение из "${firstWorkout.name}" — устала спина` });
    }

    if (workoutHistory.length === 0) return prompts;

    const last = workoutHistory[0];
    if (last) {
      prompts.push({ emoji: '🔍', text: `Разбери мою последнюю тренировку: ${last.name}` });
    }

    // Week analysis if ≥2 workouts in last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekWorkouts = workoutHistory.filter((w) => new Date(w.completedAt || w.startedAt || '').getTime() > weekAgo);
    if (weekWorkouts.length >= 2) {
      const totalVol = weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
      prompts.push({
        emoji: '📊',
        text: `Анализ моей недели: ${weekWorkouts.length} тренировок, объём ${Math.round(totalVol / 1000 * 10) / 10} т`,
      });
    }

    // Suggest rest if trained 3+ days in a row
    const sortedDates = workoutHistory
      .map((w) => new Date(w.completedAt || w.startedAt || '').toDateString())
      .filter((v, i, a) => a.indexOf(v) === i);
    let consecutive = 0;
    const today = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (sortedDates.includes(d.toDateString())) consecutive++;
      else break;
    }
    if (consecutive >= 3) {
      prompts.push({ emoji: '😴', text: `Тренируюсь ${consecutive} дня подряд — стоит ли взять день отдыха?` });
    }

    // Suggest scheduling if user has active program but hasn't done it yet
    if (activeProgram && activeProgram.workouts && activeProgram.workouts.length > 1 && workoutHistory.length < 3) {
      prompts.push({ emoji: '📅', text: `Расставь тренировки программы "${activeProgram.name}" по дням недели` });
    }

    // Suggest creating a program if user has no active program
    if (!activeProgram) {
      prompts.push({ emoji: '📋', text: 'Составь мне программу тренировок Толчок-Тяга-Ноги на 3 дня в неделю' });
    }

    return prompts;
  }, [workoutHistory, programs]);

  const staticPrompts = serverStarters.length > 0
    ? serverStarters.map((s) => ({ emoji: s.emoji, text: s.text }))
    : FALLBACK_PROMPTS;
  const allQuickPrompts = [...dynamicPrompts, ...staticPrompts];

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
            {isPremiumActive() && (
              <View style={[styles.proBadge, { backgroundColor: colors.accent }]}>
                <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>PRO</Text>
              </View>
            )}
            {lastMeta?.recovery != null && (
              <View style={[styles.recoveryBadge, { backgroundColor: getRecoveryColor(lastMeta.recovery) + '20', borderColor: getRecoveryColor(lastMeta.recovery) + '60' }]}>
                <Text style={{ fontSize: 10, color: getRecoveryColor(lastMeta.recovery), fontWeight: '700' }}>
                  {getRecoveryLabel(lastMeta.recovery)} {lastMeta.recovery}%
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={[typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
              {isPremiumActive()
                ? 'Безлимитный доступ'
                : `Осталось ${aiMessagesLeft()} из ${FREE_LIMITS.AI_MESSAGES_PER_DAY} сообщений`}
            </Text>
            {lastMeta?.streak != null && lastMeta.streak > 0 && (
              <Text style={[typography.small, { color: colors.accent, marginTop: 2, fontWeight: '600' }]}>
                🔥 {lastMeta.streak} дн
              </Text>
            )}
          </View>
        </View>
      </View>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="ai_limit"
        navigation={navigation}
      />

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
              {dynamicPrompts.length > 0 && (
                <Text style={[typography.captionMedium, { color: colors.textTertiary, marginBottom: spacing.xs, marginLeft: 2 }]}>
                  ДЛЯ ТЕБЯ
                </Text>
              )}
              {allQuickPrompts.map((prompt, i) => (
                <React.Fragment key={i}>
                  {i === dynamicPrompts.length && dynamicPrompts.length > 0 && (
                    <Text style={[typography.captionMedium, { color: colors.textTertiary, marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: 2 }]}>
                      {serverStarters.length > 0 ? 'РЕКОМЕНДАЦИИ' : 'ПОПУЛЯРНЫЕ ВОПРОСЫ'}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => sendMessage(prompt.text)}
                    style={[
                      styles.quickPrompt,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      i < dynamicPrompts.length && { borderColor: colors.primary + '40', backgroundColor: colors.primary + '08' },
                    ]}
                  >
                    <Text style={{ fontSize: 16, marginRight: spacing.xs }}>{prompt.emoji}</Text>
                    <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{prompt.text}</Text>
                  </TouchableOpacity>
                </React.Fragment>
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

      {/* AI Action notifications */}
      {lastActions.length > 0 && (
        <View style={[styles.actionsBar, { backgroundColor: colors.success + '18', borderTopColor: colors.success + '40' }]}>
          {lastActions.map((action, i) => (
            <View key={i} style={[styles.actionChip, { backgroundColor: colors.success + '22', borderColor: colors.success + '55' }]}>
              <Text style={{ fontSize: 13, marginRight: 4 }}>✓</Text>
              <Text style={[typography.small, { color: colors.success, flex: 1 }]}>{action.description}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Celebration banner for milestones & PRs */}
      {celebration && (
        <View style={[styles.celebrationBar, { backgroundColor: colors.accent + '15', borderTopColor: colors.accent + '40' }]}>
          {celebration.milestones.map((m, i) => (
            <View key={`m-${i}`} style={[styles.celebrationChip, { backgroundColor: colors.accent + '20', borderColor: colors.accent + '50' }]}>
              <Text style={{ fontSize: 14, marginRight: 4 }}>🏆</Text>
              <Text style={[typography.small, { color: colors.accent, fontWeight: '700', flex: 1 }]}>{m}</Text>
            </View>
          ))}
          {celebration.prs.map((pr, i) => (
            <View key={`pr-${i}`} style={[styles.celebrationChip, { backgroundColor: '#FF9800' + '20', borderColor: '#FF9800' + '50' }]}>
              <Text style={{ fontSize: 14, marginRight: 4 }}>🎉</Text>
              <Text style={[typography.small, { color: '#FF9800', fontWeight: '700', flex: 1 }]}>Новый рекорд: {pr}</Text>
            </View>
          ))}
        </View>
      )}

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
  proBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recoveryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
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
  actionsBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  celebrationBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
  celebrationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
});
