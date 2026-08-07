import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ScrollView, Modal,
  AppState,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supportService } from '../../services/supportService';
import { adminService } from '../../services/adminService';
import { useAdminStepUp, StepUpCancelledError } from './useAdminStepUp';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeColors } from '../../store/useThemeStore';
import { Spinner, Icon } from '../../components';
import type { SupportTicket, SupportMessage, TicketStatus, TicketPriority } from '../../types';
import type { Colors } from '../../theme/colors';

const SUB_PLANS = [
  { value: 'pro', label: 'PRO', getColor: (c: Colors) => c.primary },
  { value: 'trainer', label: 'Trainer', getColor: (c: Colors) => c.warning },
  { value: 'club', label: 'Club', getColor: (c: Colors) => c.success },
] as const;
const SUB_DURATIONS = [
  { days: 30, label: '1 месяц' },
  { days: 90, label: '3 месяца' },
  { days: 180, label: '6 месяцев' },
  { days: 365, label: '1 год' },
];

const CANNED_REPLIES = [
  'Здравствуйте! Спасибо за обращение. Мы рассмотрим ваш вопрос в ближайшее время.',
  'Ваша проблема была зафиксирована и передана в технический отдел.',
  'Пожалуйста, опишите подробнее: какое устройство используете и какая версия приложения?',
  'Проблема решена. Пожалуйста, перезапустите приложение и проверьте.',
  'К сожалению, данный функционал пока не поддерживается. Мы учтём ваш запрос.',
  'Подписка успешно активирована. Наслаждайтесь Giron PRO!',
  'Спасибо за терпение! Закрываем тикет. Если возникнут вопросы — пишите снова.',
] as const;

type RouteParams = { ticketId: string };

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
const statusColorOf = (s: TicketStatus, c: Colors): string => {
  if (s === 'open') return c.error;
  if (s === 'in_progress') return c.warning;
  if (s === 'resolved') return c.success;
  return c.textSecondary;
};
const priorityColorOf = (p: TicketPriority, c: Colors): string => {
  if (p === 'urgent') return c.error;
  if (p === 'high') return c.warning;
  if (p === 'normal') return c.primary;
  return c.textSecondary;
};

function MessageBubble({ msg, myId, colors }: { msg: SupportMessage; myId?: string; colors: Colors }) {
  const isMe = msg.authorId === myId;
  if (msg.isInternal) {
    return (
      <View style={[styles.noteBlock, { backgroundColor: colors.warning + '0E', borderColor: colors.warning + '30' }]}>
        <Text style={[styles.noteAuthor, { color: colors.warning }]}>Заметка · {msg.author.firstName}</Text>
        <Text style={[styles.noteText, { color: colors.text }]}>{msg.content}</Text>
        <Text style={[styles.noteTime, { color: colors.warning + '80' }]}>
          {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }
  return (
    <View style={[
      styles.bubble,
      isMe
        ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
        : { alignSelf: 'flex-start', backgroundColor: colors.surface },
    ]}>
      {!isMe && (
        <Text style={[styles.bubbleAuthor, { color: colors.textSecondary }]}>
          {msg.isStaff ? `Поддержка · ${msg.author.firstName}` : msg.author.firstName}
        </Text>
      )}
      <Text style={[styles.bubbleText, { color: isMe ? colors.textInverse : colors.text }]}>{msg.content}</Text>
      <Text style={[styles.bubbleTime, { color: isMe ? colors.textInverse + '80' : colors.textSecondary }]}>
        {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

export default function AdminTicketScreen() {
  const colors = useThemeColors();
  const route = useRoute<RouteProp<{ AdminTicketScreen: RouteParams }, 'AdminTicketScreen'>>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { ticketId } = route.params ?? {};
  const userId = useAuthStore((s) => s.user?.id);
  const flatRef = useRef<FlatList>(null);
  // Track all anonymous scrollToEnd timers so we can clear them on
  // unmount — without this, a setTimeout fired right before navigation
  // away still fires `flatRef.current?.scrollToEnd` on a null ref and
  // the closure keeps the screen state alive longer than necessary.
  const scrollTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Schedule a scrollToEnd that auto-cleans on unmount. Replaces 3
  // anonymous `setTimeout(() => flatRef.current?.scrollToEnd(...), ms)`
  // sites in this file (poll-on-new, mount-on-messages, send-success).
  const scheduleScroll = useCallback((animated: boolean, ms: number) => {
    const t = setTimeout(() => {
      scrollTimersRef.current.delete(t);
      flatRef.current?.scrollToEnd({ animated });
    }, ms);
    scrollTimersRef.current.add(t);
  }, []);

  // Clear every pending scroll timer on unmount.
  useEffect(() => () => {
    scrollTimersRef.current.forEach((t) => clearTimeout(t));
    scrollTimersRef.current.clear();
  }, []);
  const { withStepUp, modal: stepUpModal } = useAdminStepUp();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [subPlan, setSubPlan] = useState<'pro' | 'trainer' | 'club'>('pro');
  const [subDays, setSubDays] = useState(30);
  const [grantingSubb, setGrantingSubb] = useState(false);
  const [userTickets, setUserTickets] = useState<SupportTicket[]>([]);
  const [showUserTickets, setShowUserTickets] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [staffList, setStaffList] = useState<Array<{ id: string; firstName: string; lastName?: string | null; email: string; role: string }>>([]);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportService.getTicket(ticketId);
      setTicket(data);
      if (data.user?.email) {
        adminService.getSupportTickets({ search: data.user.email, limit: 10 })
          .then((res) => setUserTickets(res.tickets.filter((t) => t.id !== ticketId)))
          .catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const poll = useCallback(async () => {
    try {
      const data = await supportService.getTicket(ticketId);
      setTicket((prev) => {
        if (!prev) return data;
        if (data.messages.length !== prev.messages.length) {
          scheduleScroll(true, 100);
        }
        return data;
      });
    } catch { /* ignore */ }
  }, [ticketId]);

  // Round 271: include `load` (useCallback over ticketId) so a route
  // param change re-fires the fetch. Previously the empty deps array
  // captured the first ticket only — admin opening a second ticket
  // via deep link saw stale data.
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(poll, 20000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { poll(); start(); } else { stop(); }
    });
    return () => { stop(); sub.remove(); };
  }, [poll]);

  useEffect(() => {
    if (ticket?.messages.length) {
      scheduleScroll(false, 100);
    }
  }, [ticket?.messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      if (isNoteMode) {
        const note = await adminService.addInternalNote(ticketId, trimmed);
        setTicket((t) => t ? { ...t, messages: [...t.messages, note as any] } : t);
      } else {
        const msg = await supportService.sendMessage(ticketId, trimmed);
        setTicket((t) => t ? { ...t, messages: [...t.messages, msg] } : t);
      }
      scheduleScroll(true, 100);
    } catch {
      Alert.alert('Ошибка', isNoteMode ? 'Не удалось добавить заметку' : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }, [text, sending, ticketId, isNoteMode]);

  const changeStatus = useCallback(async (status: TicketStatus) => {
    if (!ticket) return;
    try {
      const updated = await supportService.updateTicketStatus(ticketId, { status });
      setTicket(updated);
    } catch {
      Alert.alert('Ошибка', 'Не удалось изменить статус');
    }
  }, [ticket, ticketId]);

  const changePriority = useCallback(async (priority: TicketPriority) => {
    if (!ticket) return;
    try {
      const updated = await supportService.updateTicketStatus(ticketId, { priority });
      setTicket(updated);
    } catch {
      Alert.alert('Ошибка', 'Не удалось изменить приоритет');
    }
  }, [ticket, ticketId]);

  const assignToMe = useCallback(async () => {
    if (!ticket || !userId) return;
    const isAssignedToMe = ticket.assignedToId === userId;
    try {
      const updated = await supportService.assignTicket(ticketId, isAssignedToMe ? null : userId);
      setTicket(updated);
    } catch {
      Alert.alert('Ошибка', 'Не удалось изменить назначение');
    }
  }, [ticket, ticketId, userId]);

  const openAssignModal = useCallback(async () => {
    setShowAssignModal(true);
    if (staffList.length === 0) {
      try {
        const list = await adminService.getStaff();
        setStaffList(list);
      } catch { /* ignore */ }
    }
  }, [staffList.length]);

  const doAssign = useCallback(async (staffId: string | null) => {
    if (!ticket || assigning) return;
    setAssigning(true);
    try {
      const updated = await adminService.assignTicket(ticketId, staffId) as SupportTicket;
      setTicket(updated);
      setShowAssignModal(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось назначить тикет');
    } finally {
      setAssigning(false);
    }
  }, [ticket, ticketId, assigning]);

  const grantSubscription = useCallback(async () => {
    if (!ticket?.user?.id || grantingSubb) return;
    const userId = ticket.user.id;
    setGrantingSubb(true);
    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + subDays);
      await withStepUp((creds) => adminService.changeUserSubscription(userId, {
        plan: subPlan,
        status: 'active',
        endDate: endDate.toISOString().split('T')[0],
      }, creds));
      setShowSubModal(false);
      Alert.alert('Готово', `Подписка ${subPlan.toUpperCase()} выдана на ${subDays} дней`);
    } catch (e) {
      if (!(e instanceof StepUpCancelledError)) Alert.alert('Ошибка', 'Не удалось выдать подписку');
    } finally {
      setGrantingSubb(false);
    }
  }, [ticket, subPlan, subDays, grantingSubb, withStepUp]);

  const quickClose = useCallback(async () => {
    Alert.alert('Закрыть тикет?', 'Тикет будет помечен как "closed".', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Закрыть',
        onPress: async () => {
          try {
            const updated = await supportService.updateTicketStatus(ticketId, { status: 'closed' });
            setTicket(updated);
          } catch {
            Alert.alert('Ошибка', 'Не удалось закрыть тикет');
          }
        },
      },
    ]);
  }, [ticketId]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Spinner size={32} color={colors.primary} />
      </View>
    );
  }
  if (!ticket) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Тикет не найден</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {/* R240: step-up re-auth modal for financial ops */}
      {stepUpModal}
      {/* Canned replies modal */}
      <Modal visible={showCanned} transparent animationType="slide" onRequestClose={() => setShowCanned(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Быстрые ответы</Text>
              <TouchableOpacity onPress={() => setShowCanned(false)}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {CANNED_REPLIES.map((reply, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.cannedItem, { borderBottomColor: colors.border }]}
                onPress={() => { setText(reply); setShowCanned(false); }}
              >
                <Text style={[styles.cannedText, { color: colors.text }]} numberOfLines={2}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Subscription grant modal */}
      <Modal visible={showSubModal} transparent animationType="slide" onRequestClose={() => setShowSubModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Выдать подписку</Text>
              <TouchableOpacity onPress={() => setShowSubModal(false)}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.subModalSection, { color: colors.textSecondary }]}>Тариф</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {SUB_PLANS.map((p) => {
                const pColor = p.getColor(colors);
                const isActive = subPlan === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    style={[
                      styles.subPlanBtn,
                      { backgroundColor: colors.surfaceElevated },
                      isActive && { backgroundColor: pColor + '22', borderColor: pColor },
                    ]}
                    onPress={() => setSubPlan(p.value)}
                  >
                    <Text style={[styles.subPlanText, { color: colors.textSecondary }, isActive && { color: pColor }]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.subModalSection, { color: colors.textSecondary }]}>Срок</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {SUB_DURATIONS.map((d) => {
                const isActive = subDays === d.days;
                return (
                  <TouchableOpacity
                    key={d.days}
                    style={[
                      styles.subPlanBtn,
                      { backgroundColor: colors.surfaceElevated },
                      isActive && { backgroundColor: colors.primary + '22', borderColor: colors.primary },
                    ]}
                    onPress={() => setSubDays(d.days)}
                  >
                    <Text style={[styles.subPlanText, { color: colors.textSecondary }, isActive && { color: colors.primary }]}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.subGrantBtn, { backgroundColor: colors.primary }, grantingSubb && { opacity: 0.6 }]}
              onPress={grantSubscription}
              disabled={grantingSubb}
            >
              {grantingSubb
                ? <Spinner color={colors.textInverse} size={18} />
                : <Text style={[styles.subGrantBtnText, { color: colors.textInverse }]}>Выдать {subPlan.toUpperCase()} на {subDays} дней</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Staff assign modal */}
      <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Назначить тикет</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Text style={{ color: colors.textSecondary, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {ticket?.assignedToId && (
              <TouchableOpacity
                style={[styles.cannedItem, { borderBottomColor: colors.error + '30' }]}
                onPress={() => doAssign(null)}
                disabled={assigning}
              >
                <Text style={{ fontSize: 14, color: colors.error }}>✕ Снять назначение</Text>
              </TouchableOpacity>
            )}
            {staffList.length === 0 ? (
              <View style={{ marginVertical: 20, alignItems: 'center' }}>
                <Spinner color={colors.primary} />
              </View>
            ) : (
              staffList.map((s) => {
                const selected = ticket?.assignedToId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      styles.cannedItem,
                      { borderBottomColor: colors.border },
                      selected && { backgroundColor: colors.primary + '10' },
                    ]}
                    onPress={() => doAssign(s.id)}
                    disabled={assigning}
                  >
                    <Text style={{ fontSize: 14, color: selected ? colors.primary : colors.text, fontWeight: selected ? '700' : '400' }}>
                      {selected ? '✓ ' : ''}{s.firstName} {s.lastName ?? ''} · {s.role}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{s.email}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </Modal>

      {/* Ticket meta */}
      <ScrollView style={[styles.meta, { backgroundColor: colors.surface, borderBottomColor: colors.border }]} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metaContent}>
        <TouchableOpacity onPress={() => ticket.user && navigation.navigate('AdminUserDetailScreen', { userId: ticket.user.id })}>
          <Text style={[styles.metaUser, { color: colors.textSecondary, textDecorationLine: 'underline' }]}>{ticket.user?.firstName} {ticket.user?.lastName}</Text>
        </TouchableOpacity>
        <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
        {STATUS_OPTIONS.map((s) => {
          const sColor = statusColorOf(s, colors);
          const isActive = ticket.status === s;
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.chip,
                { backgroundColor: colors.surfaceElevated },
                isActive && { backgroundColor: sColor + '33', borderColor: sColor },
              ]}
              onPress={() => ticket.status !== s && changeStatus(s)}
            >
              <Text style={[styles.chipText, { color: colors.textSecondary }, isActive && { color: sColor }]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
        <Text style={[styles.metaDot, { color: colors.border }]}>·</Text>
        {PRIORITY_OPTIONS.map((p) => {
          const pColor = priorityColorOf(p, colors);
          const isActive = ticket.priority === p;
          return (
            <TouchableOpacity
              key={p}
              style={[
                styles.chip,
                { backgroundColor: colors.surfaceElevated },
                isActive && { backgroundColor: pColor + '33', borderColor: pColor },
              ]}
              onPress={() => ticket.priority !== p && changePriority(p)}
            >
              <Text style={[styles.chipText, { color: colors.textSecondary }, isActive && { color: pColor }]}>{p}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.subjectBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.subject, { color: colors.text }]} numberOfLines={2}>{ticket.subject}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <Text style={[styles.category, { color: colors.primary }]}>{ticket.category}</Text>
            <Text style={[styles.subjectMeta, { color: colors.textSecondary }]}>
              {new Date(ticket.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </Text>
            {ticket.assignedTo && (
              <Text style={[styles.assignedMeta, { color: colors.success }]}>→ {ticket.assignedTo.firstName}</Text>
            )}
            {userTickets.length > 0 && (
              <TouchableOpacity onPress={() => setShowUserTickets(!showUserTickets)}>
                <Text style={[styles.otherTicketsBtn, { color: colors.primary }]}>
                  {showUserTickets ? '▲' : '▼'} ещё {userTickets.length} тик.
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {showUserTickets && (
            <View style={[styles.otherTicketsList, { borderTopColor: colors.border }]}>
              {userTickets.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.otherTicketRow, { borderBottomColor: colors.border }]}
                  onPress={() => navigation.replace('AdminTicketScreen', { ticketId: t.id })}
                >
                  <Text style={[styles.otherTicketSubject, { color: colors.text }]} numberOfLines={1}>{t.subject}</Text>
                  <Text style={[styles.otherTicketStatus, { color: statusColorOf(t.status, colors) }]}>{t.status}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={ticket.messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble msg={item} myId={userId} colors={colors} />}
        contentContainerStyle={styles.messages}
      />

      {/* Action bar above input */}
      <View style={[styles.actionBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.actionBarBtn, { borderColor: colors.primary + '40' }]} onPress={() => setShowCanned(true)}>
          <Text style={[styles.actionBarBtnText, { color: colors.primary }]}>Шаблоны</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBarBtn, { borderColor: colors.success + '40' }]} onPress={() => setShowSubModal(true)}>
          <Text style={[styles.actionBarBtnText, { color: colors.success }]}>Подписка</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionBarBtn,
            { borderColor: colors.primary + '40' },
            ticket.assignedToId === userId && { borderColor: colors.success + '60', backgroundColor: colors.success + '08' },
          ]}
          onPress={assignToMe}
        >
          <Text style={[styles.actionBarBtnText, { color: colors.primary }, ticket.assignedToId === userId && { color: colors.success }]}>
            {ticket.assignedToId === userId ? '✓ Взят' : 'Взять'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBarBtn, { borderColor: colors.primary + '40' }]} onPress={openAssignModal}>
          <Text style={[styles.actionBarBtnText, { color: colors.primary }]}>
            {ticket.assignedTo ? `→ ${ticket.assignedTo.firstName}` : 'Назначить'}
          </Text>
        </TouchableOpacity>
        {ticket.priority !== 'urgent' && ticket.status !== 'closed' && ticket.status !== 'resolved' && (
          <TouchableOpacity
            style={[styles.actionBarBtn, { borderColor: colors.error + '40' }]}
            onPress={() => changePriority('urgent')}
          >
            <Text style={[styles.actionBarBtnText, { color: colors.error }]}>Urgent</Text>
          </TouchableOpacity>
        )}
        {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
          <TouchableOpacity
            style={[styles.actionBarBtn, { borderColor: colors.success + '60' }]}
            onPress={() => changeStatus('resolved')}
          >
            <Text style={[styles.actionBarBtnText, { color: colors.success }]}>✓ Решено</Text>
          </TouchableOpacity>
        )}
        {ticket.status !== 'closed' && (
          <TouchableOpacity style={[styles.actionBarBtn, { borderColor: colors.textSecondary + '60' }]} onPress={quickClose}>
            <Text style={[styles.actionBarBtnText, { color: colors.textSecondary }]}>✗ Закрыть</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.noteModeBtn,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            isNoteMode && { backgroundColor: colors.warning + '22', borderColor: colors.warning + '60' },
          ]}
          onPress={() => setIsNoteMode(!isNoteMode)}
        >
          <Icon name="bookmark" size={16} color={isNoteMode ? colors.warning : colors.textSecondary} />
        </TouchableOpacity>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surfaceElevated, color: colors.text },
            isNoteMode && { borderWidth: 1, borderColor: colors.warning + '40' },
          ]}
          placeholder={isNoteMode ? 'Внутренняя заметка (не видна клиенту)...' : 'Ответить клиенту...'}
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.primary }, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <Spinner color={colors.textInverse} size={18} /> : <Icon name="send" size={20} color={colors.textInverse} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  meta: { maxHeight: 52, borderBottomWidth: 1 },
  metaContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6, height: 52 },
  metaUser: { fontSize: 13, fontWeight: '600' },
  metaDot: { fontSize: 16 },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'transparent' },
  chipText: { fontSize: 11, fontWeight: '600' },
  subjectBar: { padding: 12, borderBottomWidth: 1 },
  subject: { fontSize: 14, fontWeight: '600' },
  subjectMeta: { fontSize: 11 },
  assignedMeta: { fontSize: 11, fontWeight: '600' },
  category: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  messages: { padding: 12, gap: 8, paddingBottom: 8 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginBottom: 4 },
  bubbleAuthor: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 10, textAlign: 'right', marginTop: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },

  actionBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1 },
  actionBarBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actionBarBtnText: { fontSize: 12, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  cannedItem: { paddingVertical: 12, borderBottomWidth: 1 },
  cannedText: { fontSize: 14, lineHeight: 20 },
  subModalSection: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  subPlanBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  subPlanText: { fontSize: 13, fontWeight: '700' },
  subGrantBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  subGrantBtnText: { fontSize: 15, fontWeight: '700' },
  noteBlock: { alignSelf: 'stretch', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', padding: 10, marginBottom: 4 },
  noteAuthor: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  noteText: { fontSize: 14, lineHeight: 20 },
  noteTime: { fontSize: 10, textAlign: 'right', marginTop: 4 },
  noteModeBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  noteModeBtnText: { fontSize: 18 },
  otherTicketsBtn: { fontSize: 11, fontWeight: '600' },
  otherTicketsList: { marginTop: 6, borderTopWidth: 1, paddingTop: 6 },
  otherTicketRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1 },
  otherTicketSubject: { fontSize: 12, flex: 1, marginRight: 8 },
  otherTicketStatus: { fontSize: 11, fontWeight: '600' },
});
