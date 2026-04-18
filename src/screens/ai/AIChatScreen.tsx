import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform, StyleSheet, TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import * as Speech from 'expo-speech';
import { useHaptic } from '../../hooks/useHaptic';
import { useAuthStore, useWorkoutStore, useNutritionStore, useSubscriptionStore, useCardioStore } from '../../store';
import { useMeasurementsStore } from '../../store/useMeasurementsStore';
import { useSleepStore } from '../../store/useSleepStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PaywallModal } from '../../components';
import { ChatMessage } from '../../types';
import { aiService, getApiError, AIActionResult, AIMeta, AIStarter } from '../../services';
import {
  ChatHeader, MessageBubble, QuickPromptsList, TypingIndicator,
  ActionsBar, CelebrationBar, ChatInputBar, useDynamicPrompts,
} from './components';
import { localDateStr } from '../../utils/date';

const FALLBACK_PROMPTS = [
  { emoji: '◎', text: 'Составь программу тренировок под мои цели' },
  { emoji: '◑', text: 'Рассчитай мне КБЖУ и составь рацион' },
  { emoji: '◎', text: 'Как правильно делать становую тягу?' },
  { emoji: '◉', text: 'Программа тренировок дома без оборудования' },
  { emoji: '◑', text: 'Составь рацион на день для похудения' },
  { emoji: '◈', text: 'Я застрял на плато — как пробить?' },
  { emoji: '◧', text: 'Какие добавки реально работают по науке?' },
  { emoji: '◫', text: 'Как оптимизировать сон и восстановление?' },
  { emoji: '◎', text: 'Как одновременно худеть и набирать мышцы?' },
  { emoji: '◈', text: 'Как не бросить тренировки и держать мотивацию?' },
  { emoji: '◉', text: 'Как совмещать кардио и силовые?' },
  { emoji: '◫', text: 'Болит плечо при жиме — что делать?' },
];

export const AIChatScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { user, fetchProfile } = useAuthStore();
  const { fetchHistory, fetchPrograms, setWeekPlanDay, weekPlan } = useWorkoutStore();
  const { setTargets, syncMealsFromServer, defaultTargets, getDayLog, addWater } = useNutritionStore();
  const { getWeekSessions, syncFromServer: syncCardio, addSession: addCardioSession } = useCardioStore();
  const { getLastEntries: getSleepEntries, syncFromServer: syncSleep } = useSleepStore();
  const { consumeAiMessage } = useSubscriptionStore();
  const { setRestTimerDefault, setNotificationsEnabled, setReminderHour, setWaterRemindersEnabled, setWorkoutDurationGoal } = useSettingsStore();
  const { addEntry: addMeasurementEntry } = useMeasurementsStore();
  const scrollRef = useRef<ScrollView>(null);
  const dynamicPrompts = useDynamicPrompts();

  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome', role: 'assistant', createdAt: new Date().toISOString(),
    content: `Привет${user?.firstName ? `, ${user.firstName}` : ''}! Я Iron Coach — твой персональный ИИ-тренер.\n\nМоя база знаний основана на 50+ научных исследованиях и работах лучших экспертов мира (Schoenfeld, Helms, Israetel, Nuckols, Aragon и др.).\n\nЯ могу помочь с:\n\n- Программы тренировок (зал, дом, любой уровень)\n- Питание и КБЖУ — расчёт и составление рациона\n- Техника — детальный разбор любого упражнения\n- Наука — физиология мышц, гормоны, биомеханика\n- Кардио — HIIT, LISS, совмещение с силовыми\n- Восстановление — сон, стресс, профилактика травм\n- Добавки — что работает, а что маркетинг\n- Мотивация — привычки, цели, преодоление плато\n\nВыбери вопрос ниже или спроси своё!`,
  }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastActions, setLastActions] = useState<AIActionResult[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [lastMeta, setLastMeta] = useState<AIMeta | null>(null);
  const [serverStarters, setServerStarters] = useState<AIStarter[]>([]);
  const [celebration, setCelebration] = useState<{ milestones: string[]; prs: string[] } | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard against concurrent sends: true while any request (streaming or fallback) is in flight.
  // isTyping becomes false when streaming starts, so isSendingRef is the reliable lock.
  const isSendingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Stop speech and clear timers on unmount
  useEffect(() => () => {
    isMountedRef.current = false;
    Speech.stop();
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    if (actionsTimerRef.current) clearTimeout(actionsTimerRef.current);
  }, []);

  const handleSpeak = (id: string, text: string) => {
    if (speakingId === id) {
      Speech.stop();
      setSpeakingId(null);
    } else {
      Speech.stop();
      setSpeakingId(id);
      Speech.speak(text, {
        language: 'ru-RU',
        rate: 0.9,
        onDone: () => setSpeakingId(null),
        onStopped: () => setSpeakingId(null),
      });
    }
  };

  useEffect(() => {
    aiService.getChatHistory(100, 1).then(({ messages: history, pages }) => {
      setHistoryTotalPages(pages);
      if (history.length > 0) {
        setMessages((prev) => {
          // Don't overwrite if user already sent messages while history was loading
          if (prev.length > 1) return prev;
          return [
            { id: 'welcome', role: 'assistant', createdAt: new Date().toISOString(), content: `С возвращением${user?.firstName ? `, ${user.firstName}` : ''}! Продолжим работу. Спрашивай что угодно.` },
            ...history,
          ];
        });
      }
    }).catch(() => {});
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || historyPage >= historyTotalPages) return;
    setLoadingOlderMessages(true);
    try {
      const nextPage = historyPage + 1;
      const { messages: older, pages } = await aiService.getChatHistory(100, nextPage);
      setHistoryPage(nextPage);
      setHistoryTotalPages(pages);
      setMessages((prev) => {
        // Insert older messages after the welcome message (index 0)
        const [welcome, ...rest] = prev;
        return [welcome, ...older, ...rest];
      });
    } catch {
      // Silently ignore — user can tap again
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [loadingOlderMessages, historyPage, historyTotalPages]);

  useEffect(() => {
    aiService.getStarters().then((starters) => { if (starters.length > 0) setServerStarters(starters); }).catch(() => {});
    syncSleep().catch(() => {});
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    // Acquire lock FIRST — prevents a race where two rapid taps both pass the quota
    // check before either sets the lock, allowing double-consumption of free credits.
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    if (!consumeAiMessage()) { isSendingRef.current = false; haptic.warning(); setShowPaywall(true); return; }
    haptic.light();

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: text.trim(), createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const todayDate = localDateStr(new Date());
      const todayLog = getDayLog(todayDate);
      const cardioSessions = getWeekSessions().map(({ type, date, durationMinutes, distanceKm, caloriesBurned, avgHeartRate }) => ({ type, date, durationMinutes, distanceKm, caloriesBurned, avgHeartRate }));
      const sleepEntries = getSleepEntries(14).map(({ date, durationHours, quality }) => ({ date, durationHours, quality }));
      const nutritionTargets = { calories: todayLog.targetCalories, protein: todayLog.targetProtein, fats: todayLog.targetFats ?? defaultTargets.fats, carbs: todayLog.targetCarbs ?? defaultTargets.carbs, waterTargetMl: todayLog.waterTargetMl ?? defaultTargets.waterTargetMl };

      // Streaming message placeholder
      const streamMsgId = `ai-${Date.now()}`;
      setMessages((prev) => [...prev, { id: streamMsgId, role: 'assistant', content: '', createdAt: new Date().toISOString() }]);
      setIsTyping(false);

      let response: { message: string; actions: AIActionResult[]; meta?: AIMeta } | null = null;

      try {
        const stream = aiService.chatStream(text.trim(), nutritionTargets, todayLog.waterMl, weekPlan, cardioSessions, (result) => {
          response = { message: '', actions: result.actions, meta: result.meta };
        }, sleepEntries, todayDate);

        for await (const chunk of stream) {
          if (!isMountedRef.current) break;
          setMessages((prev) => prev.map((m) =>
            m.id === streamMsgId ? { ...m, content: m.content + chunk } : m
          ));
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
        }
      } catch {
        // Streaming failed — fall back to regular request
        try {
          const fallback = await aiService.chat(text.trim(), nutritionTargets, todayLog.waterMl, weekPlan, cardioSessions, sleepEntries, todayDate);
          if (!isMountedRef.current) return;
          response = fallback;
          setMessages((prev) => prev.map((m) =>
            m.id === streamMsgId ? { ...m, content: fallback.message } : m
          ));
        } catch (fallbackErr) {
          // Remove the empty stream placeholder so the outer catch's error message
          // is the only thing added to the chat.
          setMessages((prev) => prev.filter((m) => m.id !== streamMsgId));
          throw fallbackErr;
        }
      }

      haptic.success();

      if (response?.meta) {
        setLastMeta(response.meta);
        const cel = { milestones: response.meta.milestones ?? [], prs: response.meta.newPRs ?? [] };
        if (cel.milestones.length > 0 || cel.prs.length > 0) {
          setCelebration(cel);
          if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
          celebrationTimerRef.current = setTimeout(() => setCelebration(null), 8000);
        }
      }

      if (response && response.actions && response.actions.length > 0) {
        const actions = response.actions;
        setLastActions(actions);
        if (actionsTimerRef.current) clearTimeout(actionsTimerRef.current);
        actionsTimerRef.current = setTimeout(() => setLastActions([]), 6000);
        const types = actions.map((act) => act.type);
        if (types.includes('create_workout') || types.includes('modify_workout') || types.includes('create_program') || types.includes('delete_program') || types.includes('adjust_all_weights') || types.includes('swap_exercise') || types.includes('add_superset')) {
          fetchPrograms().catch(() => {});
          fetchHistory().catch(() => {});
        }
        if (types.includes('update_user_profile') || types.includes('log_body_weight')) fetchProfile().catch(() => {});
        if (types.includes('log_meal') || types.includes('delete_meal') || types.includes('modify_meal')) syncMealsFromServer(localDateStr(new Date())).catch(() => {});
        if (types.includes('log_cardio')) syncCardio().catch(() => {});
        if (types.includes('log_water')) {
          const waterAction = actions.find((act) => act.type === 'log_water');
          if (waterAction?.data?.ml) addWater(localDateStr(new Date()), waterAction.data.ml as number);
        }
        if (types.includes('update_nutrition_targets')) {
          const nutrAction = actions.find((act) => act.type === 'update_nutrition_targets');
          if (nutrAction?.data) {
            const { calories, protein, fats, carbs } = nutrAction.data as any;
            if (typeof calories === 'number' && typeof protein === 'number' && typeof fats === 'number' && typeof carbs === 'number') {
              setTargets(localDateStr(new Date()), { calories, protein, fats, carbs });
            }
          }
        }
        if (types.includes('set_water_target')) {
          const wtAction = actions.find((act) => act.type === 'set_water_target');
          if (wtAction?.data?.waterTargetMl) {
            const today = localDateStr(new Date());
            const currentTargets = defaultTargets;
            setTargets(today, { calories: currentTargets.calories, protein: currentTargets.protein, fats: currentTargets.fats, carbs: currentTargets.carbs, waterTargetMl: wtAction.data.waterTargetMl as number });
          }
        }
        if (types.includes('set_rest_timer')) {
          const rtAction = actions.find((act) => act.type === 'set_rest_timer');
          if (rtAction?.data?.restTimerSeconds) setRestTimerDefault(rtAction.data.restTimerSeconds as number);
        }
        if (types.includes('set_notifications')) {
          const notifAction = actions.find((act) => act.type === 'set_notifications');
          if (notifAction?.data) {
            if (notifAction.data.notificationsEnabled !== undefined) setNotificationsEnabled(notifAction.data.notificationsEnabled as boolean);
            if (notifAction.data.reminderHour !== undefined) setReminderHour(notifAction.data.reminderHour as number);
            if (notifAction.data.waterRemindersEnabled !== undefined) setWaterRemindersEnabled(notifAction.data.waterRemindersEnabled as boolean);
          }
        }
        if (types.includes('set_workout_duration_goal')) {
          const durAction = actions.find((act) => act.type === 'set_workout_duration_goal');
          if (durAction?.data?.durationGoalMinutes !== undefined) setWorkoutDurationGoal(durAction.data.durationGoalMinutes as number);
        }
        if (types.includes('set_weekly_plan')) {
          const planAction = actions.find((act) => act.type === 'set_weekly_plan');
          const schedule = planAction?.data?.schedule as Array<{ dayIndex: number; workoutName: string; emoji: string; exerciseIds: string[] }> | undefined;
          if (schedule) schedule.forEach((day) => setWeekPlanDay(day.dayIndex, { name: day.workoutName, emoji: day.emoji || '◎', exercises: day.exerciseIds }));
        }
        if (types.includes('log_body_measurement')) {
          const measAction = actions.find((act) => act.type === 'log_body_measurement');
          if (measAction?.data) {
            const d = measAction.data as Record<string, any>;
            const bicepLeft = typeof d.bicepLeft === 'number' ? d.bicepLeft : undefined;
            const bicepRight = typeof d.bicepRight === 'number' ? d.bicepRight : undefined;
            const thighLeft = typeof d.thighLeft === 'number' ? d.thighLeft : undefined;
            const thighRight = typeof d.thighRight === 'number' ? d.thighRight : undefined;
            const calfLeft = typeof d.calfLeft === 'number' ? d.calfLeft : undefined;
            const calfRight = typeof d.calfRight === 'number' ? d.calfRight : undefined;
            const avg = (a?: number, b?: number) =>
              a !== undefined && b !== undefined ? Math.round((a + b) / 2 * 10) / 10 : (b ?? a);
            addMeasurementEntry({
              date: typeof d.date === 'string' ? d.date : localDateStr(new Date()),
              chest: typeof d.chest === 'number' ? d.chest : undefined,
              waist: typeof d.waist === 'number' ? d.waist : undefined,
              hips: typeof d.hips === 'number' ? d.hips : undefined,
              neck: typeof d.neck === 'number' ? d.neck : undefined,
              bicep: avg(bicepLeft, bicepRight),
              thigh: avg(thighLeft, thighRight),
              calf: avg(calfLeft, calfRight),
            });
          }
        }
      }
    } catch (e) {
      const apiError = getApiError(e);
      haptic.error();
      setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: 'assistant', createdAt: new Date().toISOString(), content: apiError.message }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const staticPrompts = serverStarters.length > 0 ? serverStarters.map((s) => ({ emoji: s.emoji, text: s.text })) : FALLBACK_PROMPTS;
  const allPrompts = [...dynamicPrompts, ...staticPrompts];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ChatHeader lastMeta={lastMeta} />
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} reason="ai_limit" navigation={navigation} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {historyPage < historyTotalPages && (
          <View style={styles.loadOlderContainer}>
            <TouchableOpacity style={styles.loadOlderButton} onPress={loadOlderMessages} disabled={loadingOlderMessages}>
              {loadingOlderMessages
                ? <ActivityIndicator size="small" color="#8B5CF6" />
                : <Text style={styles.loadOlderText}>Загрузить старые сообщения</Text>}
            </TouchableOpacity>
          </View>
        )}
        {messages.map((msg, i) => <MessageBubble key={msg.id} message={msg} isLast={i === messages.length - 1} speakingId={speakingId} onSpeak={handleSpeak} />)}
        {messages.length <= 1 && <QuickPromptsList dynamicPrompts={dynamicPrompts} allPrompts={allPrompts} hasServerStarters={serverStarters.length > 0} onSend={sendMessage} />}
        {isTyping && <TypingIndicator />}
      </ScrollView>

      <ActionsBar actions={lastActions} />
      <CelebrationBar celebration={celebration} />
      <ChatInputBar value={input} onChange={setInput} isTyping={isTyping} onSend={() => sendMessage(input)} />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  messages: { padding: 16, paddingBottom: 8 },
  loadOlderContainer: { alignItems: 'center', marginBottom: 12 },
  loadOlderButton: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#8B5CF6', minWidth: 48, alignItems: 'center' },
  loadOlderText: { color: '#8B5CF6', fontSize: 13 },
});
