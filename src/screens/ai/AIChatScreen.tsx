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
import { aiService, getApiError, AIActionResult, AIMeta, AIStarter, nutritionService, workoutService } from '../../services';
import { applyAINavigation } from '../../utils/aiNavigation';
import {
  ChatHeader, MessageBubble, QuickPromptsList, TypingIndicator,
  ActionsBar, CelebrationBar, ChatInputBar, UndoToast, useDynamicPrompts,
  SuggestionChips, FirstPromptCta,
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
  // Round 128: prompts that exercise the new analytics + memory tools
  // (rounds 94-100). Surfacing them in the welcome chip list nudges
  // users to discover features that otherwise only fire when the user
  // already knows to ask.
  { emoji: '◇', text: 'Покажи мои личные рекорды за последние месяцы' },
  { emoji: '◇', text: 'Сравни мои тренировки за этот месяц с прошлым' },
  { emoji: '◇', text: 'Что приготовить под лёгкий ужин до 500 ккал?' },
];

export const AIChatScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { user, fetchProfile } = useAuthStore();
  const { fetchHistory, fetchPrograms, setWeekPlanDay, weekPlan } = useWorkoutStore();
  const { setTargets, syncMealsFromServer, defaultTargets, getDayLog, addWater, applyServerTargets } = useNutritionStore();
  const { getWeekSessions, syncFromServer: syncCardio, addSession: addCardioSession } = useCardioStore();
  const { getLastEntries: getSleepEntries, syncFromServer: syncSleep } = useSleepStore();
  const { consumeAiMessage, isPremiumActive, aiMessagesLeft } = useSubscriptionStore();
  const { setRestTimerDefault, setNotificationsEnabled, setReminderHour, setWaterRemindersEnabled, setWorkoutDurationGoal } = useSettingsStore();
  const { addEntry: addMeasurementEntry } = useMeasurementsStore();
  const scrollRef = useRef<ScrollView>(null);
  const dynamicPrompts = useDynamicPrompts();

  // Build the welcome message once at first mount. The free-tier quota
  // hint is computed from the subscription store snapshot — premium users
  // see no quota line, free users get an explicit "X сообщений в день"
  // ahead of any usage so they aren't surprised by the paywall on the 11th
  // message.
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const isPremium = isPremiumActive();
    const remaining = aiMessagesLeft();
    const quotaLine = isPremium
      ? ''
      : `\n\n💬 На бесплатном тарифе — ${remaining} сообщений сегодня (обновляется каждый день в полночь).`;
    return [{
      id: 'welcome', role: 'assistant', createdAt: new Date().toISOString(),
      content: `Привет${user?.firstName ? `, ${user.firstName}` : ''}! Я Iron Coach — твой персональный ИИ-тренер.${quotaLine}\n\nМоя база знаний основана на 50+ научных исследованиях и работах лучших экспертов мира (Schoenfeld, Helms, Israetel, Nuckols, Aragon и др.).\n\nЯ могу помочь с:\n\n- Программы тренировок (зал, дом, любой уровень)\n- Питание и КБЖУ — расчёт и составление рациона\n- Техника — детальный разбор любого упражнения\n- Наука — физиология мышц, гормоны, биомеханика\n- Кардио — HIIT, LISS, совмещение с силовыми\n- Восстановление — сон, стресс, профилактика травм\n- Добавки — что работает, а что маркетинг\n- Мотивация — привычки, цели, преодоление плато\n\n⚠️ Важно: мои рекомендации носят информационный характер и не заменяют консультацию врача. При болях, травмах, хронических заболеваниях и перед началом программы — проконсультируйтесь со специалистом.\n\nВыбери вопрос ниже или спроси своё!`,
    }];
  });
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
  // Tracks active streaming state (AbortController + flag for UI). The previous
  // generation blocked the user from sending a new question until the model
  // stopped talking, and offered no way to cut a long rambling answer short.
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Undo toast state for destructive AI tools (delete_meal / delete_program).
  // The AI executes and announces the deletion immediately; this toast gives
  // the user ~8s to reverse it if the model misinterpreted their intent.
  const [undoState, setUndoState] = useState<
    | { kind: 'delete_meal'; label: string; snapshot: { type: string; date: string; items: Array<{ name: string; calories: number; protein: number; fats: number; carbs: number; weightGrams: number }> } }
    | { kind: 'delete_program'; label: string; snapshot: { programId: string } }
    | null
  >(null);

  // Stop speech, cancel in-flight stream, and clear timers on unmount
  useEffect(() => () => {
    isMountedRef.current = false;
    Speech.stop();
    abortRef.current?.abort();
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
    aiService.getStarters(localDateStr(new Date()), new Date().getHours()).then((starters) => { if (starters.length > 0) setServerStarters(starters); }).catch(() => {});
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
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      let response: { message: string; actions: AIActionResult[]; meta?: AIMeta } | null = null;
      let userAborted = false;

      try {
        const stream = aiService.chatStream(text.trim(), nutritionTargets, todayLog.waterMl, weekPlan, cardioSessions, (result) => {
          response = { message: '', actions: result.actions, meta: result.meta };
        }, sleepEntries, todayDate, controller.signal);

        for await (const chunk of stream) {
          if (!isMountedRef.current) break;
          if (controller.signal.aborted) { userAborted = true; break; }
          setMessages((prev) => prev.map((m) =>
            m.id === streamMsgId ? { ...m, content: m.content + chunk } : m
          ));
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
        }
      } catch (e: any) {
        if (controller.signal.aborted || e?.name === 'AbortError') {
          userAborted = true;
        } else {
          // Streaming failed for a non-user reason — fall back to regular request
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
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
      }

      if (userAborted) {
        // Annotate the truncated bubble so it's clear the answer was cut short.
        setMessages((prev) => prev.map((m) =>
          m.id === streamMsgId
            ? { ...m, content: m.content ? `${m.content}\n\n— остановлено —` : '— остановлено —' }
            : m
        ));
        isSendingRef.current = false;
        return;
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

        // Destructive actions → show Undo toast with the snapshot the server
        // attached. We prefer the most recent deletion if the AI somehow
        // produced several in one turn (rare — keeps UX simple).
        const deleteMeal = [...actions].reverse().find((a) => a.type === 'delete_meal');
        const deleteProgram = [...actions].reverse().find((a) => a.type === 'delete_program');
        if (deleteMeal?.data?.snapshot) {
          const snap = deleteMeal.data.snapshot as any;
          if (snap?.type && Array.isArray(snap?.items)) {
            setUndoState({
              kind: 'delete_meal',
              label: deleteMeal.description || 'Приём пищи удалён',
              snapshot: { type: snap.type, date: snap.date ?? localDateStr(new Date()), items: snap.items },
            });
          }
        } else if (deleteProgram?.data?.snapshot) {
          const snap = deleteProgram.data.snapshot as any;
          if (snap?.programId) {
            setUndoState({
              kind: 'delete_program',
              label: deleteProgram.description || 'Программа удалена',
              snapshot: { programId: snap.programId },
            });
          }
        }
        if (types.includes('create_workout') || types.includes('modify_workout') || types.includes('create_program') || types.includes('delete_program') || types.includes('adjust_all_weights') || types.includes('swap_exercise') || types.includes('add_superset')) {
          fetchPrograms().catch(() => {});
          fetchHistory().catch(() => {});
        }
        if (types.includes('update_user_profile') || types.includes('log_body_weight')) fetchProfile().catch(() => {});
        if (types.includes('log_meal') || types.includes('delete_meal') || types.includes('modify_meal')) syncMealsFromServer(localDateStr(new Date())).catch(() => {});
        if (types.includes('log_cardio')) syncCardio().catch(() => {});
        if (types.includes('log_sleep')) syncSleep().catch(() => {});
        if (types.includes('activate_program')) { fetchPrograms().catch(() => {}); fetchHistory().catch(() => {}); }
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
              // Also update defaultTargets so future days inherit the new KBJU goals
              applyServerTargets({ calories, protein, fats, carbs });
            }
          }
        }
        if (types.includes('set_water_target')) {
          const wtAction = actions.find((act) => act.type === 'set_water_target');
          if (wtAction?.data?.waterTargetMl) {
            const waterTargetMl = wtAction.data.waterTargetMl as number;
            const today = localDateStr(new Date());
            const todayTargets = getDayLog(today);
            setTargets(today, { calories: todayTargets.targetCalories, protein: todayTargets.targetProtein, fats: todayTargets.targetFats ?? defaultTargets.fats, carbs: todayTargets.targetCarbs ?? defaultTargets.carbs, waterTargetMl });
            // Also update defaultTargets so future days inherit the new water goal
            applyServerTargets({ waterMl: waterTargetMl });
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
          const schedule = planAction?.data?.schedule as Array<{ dayIndex: number; workoutName: string; emoji: string; exerciseIds: string[]; exerciseNames?: string[] }> | undefined;
          // Store exerciseNames (human-readable) so AI context shows names, not DB UUIDs
          if (schedule) schedule.forEach((day) => setWeekPlanDay(day.dayIndex, { name: day.workoutName, emoji: day.emoji || '◎', exercises: day.exerciseNames ?? day.exerciseIds }));
        }
        if (types.includes('log_body_measurement')) {
          const measAction = actions.find((act) => act.type === 'log_body_measurement');
          if (measAction?.data) {
            const d = measAction.data as Record<string, any>;
            // Server already averages left/right into single fields (bicep, thigh, calf)
            const toNum = (v: unknown) => typeof v === 'number' ? v : undefined;
            addMeasurementEntry({
              date: typeof d.date === 'string' ? d.date : localDateStr(new Date()),
              chest: toNum(d.chest),
              waist: toNum(d.waist),
              hips: toNum(d.hips),
              neck: toNum(d.neck),
              bicep: toNum(d.bicep),
              thigh: toNum(d.thigh),
              calf: toNum(d.calf),
            });
          }
        }

        // Round 192 — AI app navigation. The server's `navigate_to_screen`
        // tool returns actionData.navigation = { stack, screen, params }
        // ONLY for whitelisted screens. We run our own FORBIDDEN_SCREENS
        // check (defense in depth) before triggering React Navigation.
        // Only ONE navigation per response (the first valid one) — guards
        // against AI calling the tool multiple times in a single turn.
        const navAction = actions.find((act) => act.type === 'navigate_to_screen');
        if (navAction?.data?.navigation) {
          const result = applyAINavigation(navigation, navAction.data.navigation);
          if (!result.ok) {
            // Navigation rejected by client safety check — log to debugging
            // surface but don't show user (they'd be confused). The AI's
            // resultText already mentions the screen, so the chat reply
            // hints at the intent without the actual nav happening.
            // eslint-disable-next-line no-console
            console.warn('[AINav] rejected:', result.reason);
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
        {/* Activation CTA (FUNNEL-1). Shown only to users who registered
            but never sent a single message — `firstChatAt` is null on the
            User row. Disappears on the next mount once they engage. The
            prompt is intentionally narrow ("первая программа") because
            wide-open AI chats with no starting point have a known choice-
            paralysis problem on first use. */}
        {messages.length <= 1 && !user?.firstChatAt && (
          <FirstPromptCta
            onPress={() => sendMessage('Составь мне первую программу тренировок под мои цели и уровень. Учти мой пол, рост, вес и опыт. Дай готовый план на неделю с упражнениями, подходами и весами.')}
          />
        )}
        {messages.length <= 1 && <QuickPromptsList dynamicPrompts={dynamicPrompts} allPrompts={allPrompts} hasServerStarters={serverStarters.length > 0} onSend={sendMessage} />}
        {isTyping && <TypingIndicator />}
      </ScrollView>

      {/* Compact suggestion chips from the Direction A design (A_AI) —
          horizontal scroll row just above the input bar, always visible
          once the user has a few messages in. Feeds 3 contextual
          prompts; falls back to the default dynamic prompts. */}
      {messages.length > 1 && (
        <SuggestionChips
          prompts={
            (dynamicPrompts.length >= 3 ? dynamicPrompts : allPrompts)
              .slice(0, 3)
              .map((p) => p.text)
          }
          onSend={sendMessage}
        />
      )}

      <ActionsBar actions={lastActions} />
      <CelebrationBar celebration={celebration} />
      {undoState && (
        <UndoToast
          label={undoState.label}
          onUndo={async () => {
            const toUndo = undoState;
            setUndoState(null);
            try {
              if (toUndo.kind === 'delete_meal') {
                // Recreate the meal with a new server id; local cache re-syncs
                // via syncMealsFromServer so the NutritionCard reflects it.
                await nutritionService.addMeal({
                  type: toUndo.snapshot.type,
                  date: toUndo.snapshot.date,
                  items: toUndo.snapshot.items,
                });
                await syncMealsFromServer(toUndo.snapshot.date);
              } else if (toUndo.kind === 'delete_program') {
                // delete_program was a soft-delete (isActive=false). Flipping
                // the flag restores it — no data was actually lost.
                await workoutService.updateProgram(toUndo.snapshot.programId, { isActive: true });
                await fetchPrograms();
              }
              haptic.success();
              setMessages((prev) => [...prev, {
                id: `undo-${Date.now()}`,
                role: 'assistant',
                createdAt: new Date().toISOString(),
                content: toUndo.kind === 'delete_meal'
                  ? 'Приём пищи восстановлен.'
                  : 'Программа восстановлена.',
              }]);
            } catch {
              haptic.error();
              setMessages((prev) => [...prev, {
                id: `undo-err-${Date.now()}`,
                role: 'assistant',
                createdAt: new Date().toISOString(),
                content: 'Не удалось отменить — проверь соединение.',
              }]);
            }
          }}
          onDismiss={() => setUndoState(null)}
        />
      )}
      <ChatInputBar
        value={input}
        onChange={setInput}
        isTyping={isTyping}
        isStreaming={isStreaming}
        onSend={() => sendMessage(input)}
        onStop={() => {
          // Abort the current stream; the sendMessage loop will detect the signal
          // and append "— остановлено —" to the assistant bubble.
          abortRef.current?.abort();
        }}
      />
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
