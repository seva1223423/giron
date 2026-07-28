import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import * as Speech from 'expo-speech';
import { useHaptic } from '../../hooks/useHaptic';
import { useAuthStore, useWorkoutStore, useNutritionStore, useSubscriptionStore, useCardioStore } from '../../store';
import { useMeasurementsStore } from '../../store/useMeasurementsStore';
import { useSleepStore } from '../../store/useSleepStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { PaywallModal, type IconName } from '../../components';
import { ChatMessage } from '../../types';
import { aiService, getApiError, AIActionResult, AIMeta, AIStarter, nutritionService, workoutService } from '../../services';
import { applyAINavigation } from '../../utils/aiNavigation';
import {
  ChatHeader, MessageBubble, QuickPromptsList, TypingIndicator,
  ActionsBar, CelebrationBar, ChatInputBar, UndoToast, useDynamicPrompts,
  SuggestionChips, FirstPromptCta, ContextStrip, ChatWidgetView,
} from './components';
import type { ChatWidget } from './chatWidgets';
import { localDateStr } from '../../utils/date';
import { useAIChatCommands } from './useAIChatCommands';
import { drainChatWidget } from './chatWidgets';
import { CurrentWorkoutPanel } from './components/CurrentWorkoutPanel';
import { toast } from '../../components/app-modal/toast';

// Round 233 + master polish: prompts carry an on-brand SVG IconName
// instead of a raw emoji glyph (CLAUDE.md bans glyphs in UI).
// QuickPromptsList renders prompt.iconName directly.
const FALLBACK_PROMPTS: { iconName: IconName; text: string }[] = [
  { iconName: 'target',   text: 'Составь программу тренировок под мои цели' },
  { iconName: 'apple',    text: 'Рассчитай мне КБЖУ и составь рацион' },
  { iconName: 'dumbbell', text: 'Как правильно делать становую тягу?' },
  { iconName: 'home',     text: 'Программа тренировок дома без оборудования' },
  { iconName: 'apple',    text: 'Составь рацион на день для похудения' },
  { iconName: 'chart',    text: 'Я застрял на плато — как пробить?' },
  { iconName: 'bolt',     text: 'Какие добавки реально работают по науке?' },
  { iconName: 'moon',     text: 'Как оптимизировать сон и восстановление?' },
  { iconName: 'target',   text: 'Как одновременно худеть и набирать мышцы?' },
  { iconName: 'flame',    text: 'Как не бросить тренировки и держать мотивацию?' },
  { iconName: 'heart',    text: 'Как совмещать кардио и силовые?' },
  { iconName: 'heart',    text: 'Болит плечо при жиме — что делать?' },
  // Round 128: prompts that exercise the new analytics + memory tools
  // (rounds 94-100). Surfacing them in the welcome chip list nudges
  // users to discover features that otherwise only fire when the user
  // already knows to ask.
  { iconName: 'trophy',   text: 'Покажи мои личные рекорды за последние месяцы' },
  { iconName: 'chart',    text: 'Сравни мои тренировки за этот месяц с прошлым' },
  { iconName: 'apple',    text: 'Что приготовить под лёгкий ужин до 500 ккал?' },
];

// Map by first character of the emoji to the closest Icon name; everything
// else falls through to a neutral default. Used for server-provided starters
// which still arrive with an emoji field.
function starterEmojiToIcon(emoji: string | undefined): IconName {
  if (!emoji) return 'spark';
  const first = Array.from(emoji)[0] ?? '';
  if ('🏋💪🤸'.includes(first)) return 'dumbbell';
  if ('🍎🥗🍳🥦🥩'.includes(first)) return 'apple';
  if ('🔥'.includes(first)) return 'flame';
  if ('🏆🥇'.includes(first)) return 'trophy';
  if ('💧💦'.includes(first)) return 'water';
  if ('🌙😴'.includes(first)) return 'moon';
  if ('❤️♥️'.includes(first)) return 'heart';
  if ('🎯'.includes(first)) return 'target';
  if ('📊📈'.includes(first)) return 'chart';
  if ('⏱⏰'.includes(first)) return 'timer';
  if ('⚡'.includes(first)) return 'bolt';
  return 'spark';
}

export const AIChatScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { user, fetchProfile } = useAuthStore();
  // Per-slice selectors — bare destructure pulls every field of every
  // store (~25 fields across 7 stores). During streaming setMessages
  // fires 30+ times/sec; any tick of any store re-renders the whole
  // chat list. Action functions are stable refs so subscribing to them
  // costs ~nothing.
  const fetchHistory = useWorkoutStore((s) => s.fetchHistory);
  const fetchPrograms = useWorkoutStore((s) => s.fetchPrograms);
  const setWeekPlanDay = useWorkoutStore((s) => s.setWeekPlanDay);
  const weekPlan = useWorkoutStore((s) => s.weekPlan);
  const setTargets = useNutritionStore((s) => s.setTargets);
  const syncMealsFromServer = useNutritionStore((s) => s.syncMealsFromServer);
  const defaultTargets = useNutritionStore((s) => s.defaultTargets);
  const getDayLog = useNutritionStore((s) => s.getDayLog);
  const addWater = useNutritionStore((s) => s.addWater);
  const applyServerTargets = useNutritionStore((s) => s.applyServerTargets);
  const getWeekSessions = useCardioStore((s) => s.getWeekSessions);
  const syncCardio = useCardioStore((s) => s.syncFromServer);
  const addCardioSession = useCardioStore((s) => s.addSession);
  const getSleepEntries = useSleepStore((s) => s.getLastEntries);
  const syncSleep = useSleepStore((s) => s.syncFromServer);
  const consumeAiMessage = useSubscriptionStore((s) => s.consumeAiMessage);
  const refundAiMessage = useSubscriptionStore((s) => s.refundAiMessage);
  const isPremiumActive = useSubscriptionStore((s) => s.isPremiumActive);
  const aiMessagesLeft = useSubscriptionStore((s) => s.aiMessagesLeft);
  const setRestTimerDefault = useSettingsStore((s) => s.setRestTimerDefault);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setReminderHour = useSettingsStore((s) => s.setReminderHour);
  const setWaterRemindersEnabled = useSettingsStore((s) => s.setWaterRemindersEnabled);
  const setWorkoutDurationGoal = useSettingsStore((s) => s.setWorkoutDurationGoal);
  const addMeasurementEntry = useMeasurementsStore((s) => s.addEntry);
  const syncMeasurements = useMeasurementsStore((s) => s.syncFromServer);
  // Audit R-2026-05-22 (vercel-react / rendering-content-visibility):
  // FlatList instead of ScrollView so only visible rows render. With
  // 50+ messages the ScrollView used to lay out every bubble on every
  // re-render; FlatList virtualises and keeps a sliding window.
  // scrollToEnd/onContentSizeChange API is identical on both.
  const scrollRef = useRef<FlatList<ChatMessage>>(null);
  const dynamicPrompts = useDynamicPrompts();
  // Phase A: local command parser hook. Returns tryHandle(text) that short-
  // circuits the server send when a matching command (water/set/complete/
  // adjust/next/repeat) is recognized.
  const chatCommands = useAIChatCommands();

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
  // Track all anonymous scrollToEnd-after-mount timers so we can clear
  // them on unmount. Without this, a setTimeout fired right before
  // navigation away still fires `scrollRef.current?.scrollToEnd` on a
  // null ref — harmless, but the timer itself keeps the closure alive,
  // a tiny leak per chat send.
  const scrollTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
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
    // Memory-leak fix: drop every pending scrollToEnd timer.
    scrollTimersRef.current.forEach((t) => clearTimeout(t));
    scrollTimersRef.current.clear();
  }, []);

  // Schedule a scrollToEnd that auto-cleans on unmount. Replaces 4
  // anonymous `setTimeout(() => scrollRef.current?.scrollToEnd(...), ms)`
  // sites in this file — each was a small leak when the user navigated
  // away mid-send.
  const scheduleScroll = useCallback((animated: boolean, ms: number) => {
    const t = setTimeout(() => {
      scrollTimersRef.current.delete(t);
      scrollRef.current?.scrollToEnd({ animated });
    }, ms);
    scrollTimersRef.current.add(t);
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
    // Round 230: guard setState against unmount race. If user
    // navigates away before getChatHistory resolves, calling
    // setMessages on an unmounted component triggers a React warning
    // and may also overwrite the next mount's state.
    aiService.getChatHistory(100, 1).then(({ messages: history, pages }) => {
      if (!isMountedRef.current) return;
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
    // Round 230: same unmount-race guard.
    aiService.getStarters(localDateStr(new Date()), new Date().getHours()).then((starters) => {
      if (!isMountedRef.current) return;
      if (starters.length > 0) setServerStarters(starters);
    }).catch(() => {});
    syncSleep().catch(() => {});
  }, []);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Acquire lock FIRST — prevents a race where two rapid taps both pass the quota
    // check before either sets the lock, allowing double-consumption of free credits.
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    // ── Phase A: try local command parser BEFORE quota debit ──
    // Recognized commands (water, sets, complete, weight ±5, next, repeat)
    // are handled locally — instant feedback via toast, no server roundtrip,
    // no AI quota consumed. Unrecognized messages fall through to the
    // existing server pipeline below. The user bubble is still pushed so
    // the chat shows what the user typed.
    if (chatCommands.tryHandle(trimmed)) {
      haptic.light();
      const now = Date.now();
      const userMessage: ChatMessage = {
        id: `user-${now}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      // Block 2: a handler may have attached an inline widget (water/macro/
      // diff/summary). If so, append an assistant confirmation bubble that
      // carries it — gives the local command a visual reply, not just a toast.
      const pending = drainChatWidget();
      const extra: ChatMessage[] = pending
        ? [{ id: `ai-${now}`, role: 'assistant', content: pending.text, createdAt: new Date().toISOString(), widget: pending.widget }]
        : [];
      setMessages((prev) => [...prev, userMessage, ...extra]);
      setInput('');
      scheduleScroll(true, 100);
      isSendingRef.current = false;
      return;
    }

    if (!consumeAiMessage()) { isSendingRef.current = false; haptic.warning(); setShowPaywall(true); return; }
    haptic.light();

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    scheduleScroll(true, 100);

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

        // Audit R-2026-05-22 (vercel-react-best-practices): the stream
        // can fire 30+ chunks/sec — naive setMessages on every chunk
        // re-maps the whole message array and ScrollView re-layouts
        // every frame, eating the JS thread. Batch chunks into a 33ms
        // (~30fps) window so the UI still feels live but the render
        // pressure drops 10-30×. The final flush after the loop guarantees
        // the last partial buffer always lands.
        const FLUSH_INTERVAL_MS = 33;
        let streamBuffer = '';
        let lastFlushAt = 0;
        const flushStream = () => {
          if (!streamBuffer) return;
          const toAppend = streamBuffer;
          streamBuffer = '';
          setMessages((prev) => prev.map((m) =>
            m.id === streamMsgId ? { ...m, content: m.content + toAppend } : m
          ));
          scheduleScroll(false, 0);
        };

        for await (const chunk of stream) {
          if (!isMountedRef.current) break;
          if (controller.signal.aborted) { userAborted = true; break; }
          streamBuffer += chunk;
          const now = Date.now();
          if (now - lastFlushAt >= FLUSH_INTERVAL_MS) {
            lastFlushAt = now;
            flushStream();
          }
        }
        // Always drain whatever's left so the user sees the full message
        // even if the last chunk arrived inside the throttle window.
        flushStream();
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
        // The server reports 30 action types; this handler used to know 24 of
        // them. The six missing ones meant the coach answered "записал ✓"
        // while the screen kept showing stale data until a manual refresh —
        // which reads as the assistant lying about what it did (audit R13).
        if (types.includes('log_completed_workout')) fetchHistory().catch(() => {});
        if (types.includes('update_user_profile') || types.includes('log_body_weight') || types.includes('delete_body_weight')) fetchProfile().catch(() => {});
        if (types.includes('delete_body_measurement')) syncMeasurements().catch(() => {});
        if (types.includes('log_meal') || types.includes('delete_meal') || types.includes('modify_meal') || types.includes('add_recipe_to_diary')) syncMealsFromServer(localDateStr(new Date())).catch(() => {});
        if (types.includes('log_cardio') || types.includes('delete_cardio')) syncCardio().catch(() => {});
        if (types.includes('log_sleep') || types.includes('delete_sleep')) syncSleep().catch(() => {});
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
      // The daily quota is consumed before the request goes out, so a request
      // that never produced an answer used to cost one of the 10 free
      // messages. On Render's free tier the first call after idle often times
      // out, which could burn several messages without a single reply
      // (audit R16). Food scans already refund the same way.
      refundAiMessage();
      haptic.error();
      setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: 'assistant', createdAt: new Date().toISOString(), content: apiError.message }]);
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
      scheduleScroll(true, 100);
    }
  };

  const staticPrompts: { iconName: IconName; text: string }[] = serverStarters.length > 0
    ? serverStarters.map((s) => ({ iconName: starterEmojiToIcon(s.emoji), text: s.text }))
    : FALLBACK_PROMPTS;
  const allPrompts: { iconName: IconName; text: string }[] = [...dynamicPrompts, ...staticPrompts];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ChatHeader lastMeta={lastMeta} />
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} reason="ai_limit" navigation={navigation} />

      {/* Phase B: live mirror of the in-progress workout. Renders null when
          no activeWorkout — chat looks unchanged outside a session. When
          Phase A commands (`+подход 100×6`, `done`, etc.) mutate the
          workout store, the panel re-renders. */}
      <CurrentWorkoutPanel />

      {/* Live daily stats (КБЖУ / белок / вода / вес / сон) from the Direction A
          ai-chat-pro design — glanceable context so the coach reads as data-aware. */}
      <ContextStrip />

      <FlatList
        ref={scrollRef}
        data={messages}
        keyExtractor={(msg) => msg.id}
        renderItem={({ item, index }: ListRenderItemInfo<ChatMessage>) => (
          <>
            <MessageBubble
              message={item}
              isLast={index === messages.length - 1}
              speakingId={speakingId}
              onSpeak={handleSpeak}
            />
            {/* Block 2: inline widget (water/macro/diff/summary) attached to a
                local-command confirmation bubble. */}
            {item.widget != null && <ChatWidgetView widget={item.widget as ChatWidget} />}
          </>
        )}
        style={styles.list}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        // Render-window tuning — chat is mostly short bubbles; a window
        // of ~21 (10 above + visible + 10 below) keeps the user feeling
        // smooth scroll without rendering 1000-msg history at once.
        initialNumToRender={15}
        windowSize={11}
        maxToRenderPerBatch={10}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          historyPage < historyTotalPages ? (
            <View style={styles.loadOlderContainer}>
              <TouchableOpacity
                style={styles.loadOlderButton}
                onPress={loadOlderMessages}
                disabled={loadingOlderMessages}
                accessibilityRole="button"
                accessibilityLabel="Загрузить старые сообщения"
                accessibilityState={{ disabled: loadingOlderMessages, busy: loadingOlderMessages }}
              >
                {loadingOlderMessages
                  ? <ActivityIndicator size="small" color="#D4B07A" />
                  : <Text style={styles.loadOlderText}>Загрузить старые сообщения</Text>}
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListFooterComponent={
          <>
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
          </>
        }
      />

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
        // Camera → food scanner (cross-stack, same pattern HomeScreen uses).
        // Design ai-chat-pro input dock; lets the user log a meal by photo
        // without leaving the coach conversation.
        onCamera={() => navigation.navigate('NutritionTab', { screen: 'FoodScanner' })}
        // Voice input — real STT via Yandex SpeechKit (#23). ChatInputBar
        // self-manages recording → transcribe → fills the input field.
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  messages: { padding: 16, paddingBottom: 8 },
  loadOlderContainer: { alignItems: 'center', marginBottom: 12 },
  loadOlderButton: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#D4B07A', minWidth: 48, alignItems: 'center' },
  loadOlderText: { color: '#D4B07A', fontSize: 13 },
});
