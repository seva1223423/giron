import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView, Modal,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supportService } from '../../services/supportService';
import { adminService } from '../../services/adminService';
import { useAuthStore } from '../../store/useAuthStore';
import type { SupportTicket, SupportMessage, TicketStatus, TicketPriority } from '../../types';

const SUB_PLANS = [
  { value: 'pro', label: 'PRO', color: '#6366F1' },
  { value: 'trainer', label: 'Trainer', color: '#F59E0B' },
  { value: 'club', label: 'Club', color: '#10B981' },
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
  'Подписка успешно активирована. Наслаждайтесь Iron Gym PRO!',
  'Спасибо за терпение! Закрываем тикет. Если возникнут вопросы — пишите снова.',
] as const;

type RouteParams = { ticketId: string };

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
const STATUS_COLOR: Record<TicketStatus, string> = {
  open: '#EF4444', in_progress: '#F59E0B', resolved: '#10B981', closed: '#6B7280',
};
const PRIORITY_COLOR: Record<TicketPriority, string> = {
  urgent: '#EF4444', high: '#F59E0B', normal: '#6366F1', low: '#6B7280',
};

function MessageBubble({ msg, myId }: { msg: SupportMessage; myId?: string }) {
  const isMe = msg.authorId === myId;
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
      {!isMe && (
        <Text style={styles.bubbleAuthor}>
          {msg.isStaff ? `🎧 ${msg.author.firstName}` : `👤 ${msg.author.firstName}`}
        </Text>
      )}
      <Text style={styles.bubbleText}>{msg.content}</Text>
      <Text style={styles.bubbleTime}>
        {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

export default function AdminTicketScreen() {
  const route = useRoute<RouteProp<{ AdminTicketScreen: RouteParams }, 'AdminTicketScreen'>>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { ticketId } = route.params;
  const userId = useAuthStore((s) => s.user?.id);
  const flatRef = useRef<FlatList>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportService.getTicket(ticketId);
      setTicket(data);
      // Fetch other tickets from the same user
      if (data.user?.email) {
        adminService.getSupportTickets({ search: data.user.email, limit: 10 })
          .then((res) => setUserTickets(res.tickets.filter((t) => t.id !== ticketId)))
          .catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  // Silent poll — only append new messages, no loading spinner
  const poll = useCallback(async () => {
    try {
      const data = await supportService.getTicket(ticketId);
      setTicket((prev) => {
        if (!prev) return data;
        if (data.messages.length !== prev.messages.length) {
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        }
        return data;
      });
    } catch { /* ignore */ }
  }, [ticketId]);

  useEffect(() => { load(); }, []);

  // Auto-poll every 20s while screen is mounted
  useEffect(() => {
    const interval = setInterval(poll, 20000);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    if (ticket?.messages.length) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [ticket?.messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      const msg = await supportService.sendMessage(ticketId, trimmed);
      setTicket((t) => t ? { ...t, messages: [...t.messages, msg] } : t);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  }, [text, sending, ticketId]);

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

  const grantSubscription = useCallback(async () => {
    if (!ticket?.user?.id || grantingSubb) return;
    setGrantingSubb(true);
    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + subDays);
      await adminService.changeUserSubscription(ticket.user.id, {
        plan: subPlan,
        status: 'active',
        endDate: endDate.toISOString().split('T')[0],
      });
      setShowSubModal(false);
      Alert.alert('Готово', `Подписка ${subPlan.toUpperCase()} выдана на ${subDays} дней`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось выдать подписку');
    } finally {
      setGrantingSubb(false);
    }
  }, [ticket, subPlan, subDays, grantingSubb]);

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

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!ticket) return <View style={styles.center}><Text style={{ color: '#9CA3AF' }}>Тикет не найден</Text></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {/* Canned replies modal */}
      <Modal visible={showCanned} transparent animationType="slide" onRequestClose={() => setShowCanned(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Быстрые ответы</Text>
              <TouchableOpacity onPress={() => setShowCanned(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            {CANNED_REPLIES.map((reply, i) => (
              <TouchableOpacity
                key={i}
                style={styles.cannedItem}
                onPress={() => { setText(reply); setShowCanned(false); }}
              >
                <Text style={styles.cannedText} numberOfLines={2}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Subscription grant modal */}
      <Modal visible={showSubModal} transparent animationType="slide" onRequestClose={() => setShowSubModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎁 Выдать подписку</Text>
              <TouchableOpacity onPress={() => setShowSubModal(false)}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subModalSection}>Тариф</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {SUB_PLANS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.subPlanBtn, subPlan === p.value && { backgroundColor: p.color + '22', borderColor: p.color }]}
                  onPress={() => setSubPlan(p.value)}
                >
                  <Text style={[styles.subPlanText, subPlan === p.value && { color: p.color }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.subModalSection}>Срок</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {SUB_DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d.days}
                  style={[styles.subPlanBtn, subDays === d.days && { backgroundColor: '#6366F122', borderColor: '#6366F1' }]}
                  onPress={() => setSubDays(d.days)}
                >
                  <Text style={[styles.subPlanText, subDays === d.days && { color: '#6366F1' }]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.subGrantBtn, grantingSubb && { opacity: 0.6 }]}
              onPress={grantSubscription}
              disabled={grantingSubb}
            >
              {grantingSubb
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.subGrantBtnText}>Выдать {subPlan.toUpperCase()} на {subDays} дней</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Ticket meta */}
      <ScrollView style={styles.meta} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metaContent}>
        <TouchableOpacity onPress={() => ticket.user && navigation.navigate('AdminUserDetailScreen', { userId: ticket.user.id })}>
          <Text style={[styles.metaUser, { textDecorationLine: 'underline' }]}>👤 {ticket.user?.firstName} {ticket.user?.lastName}</Text>
        </TouchableOpacity>
        <Text style={styles.metaDot}>·</Text>
        {/* Status chips */}
        {STATUS_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, ticket.status === s && { backgroundColor: STATUS_COLOR[s] + '33', borderColor: STATUS_COLOR[s] }]}
            onPress={() => ticket.status !== s && changeStatus(s)}
          >
            <Text style={[styles.chipText, ticket.status === s && { color: STATUS_COLOR[s] }]}>{s}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.metaDot}>·</Text>
        {/* Priority chips */}
        {PRIORITY_OPTIONS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, ticket.priority === p && { backgroundColor: PRIORITY_COLOR[p] + '33', borderColor: PRIORITY_COLOR[p] }]}
            onPress={() => ticket.priority !== p && changePriority(p)}
          >
            <Text style={[styles.chipText, ticket.priority === p && { color: PRIORITY_COLOR[p] }]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.subjectBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subject} numberOfLines={2}>{ticket.subject}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <Text style={styles.category}>{ticket.category}</Text>
            <Text style={styles.subjectMeta}>
              {new Date(ticket.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
            </Text>
            {ticket.assignedTo && (
              <Text style={styles.assignedMeta}>→ {ticket.assignedTo.firstName}</Text>
            )}
            {userTickets.length > 0 && (
              <TouchableOpacity onPress={() => setShowUserTickets(!showUserTickets)}>
                <Text style={styles.otherTicketsBtn}>
                  {showUserTickets ? '▲' : '▼'} ещё {userTickets.length} тик.
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {showUserTickets && (
            <View style={styles.otherTicketsList}>
              {userTickets.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.otherTicketRow}
                  onPress={() => navigation.replace('AdminTicketScreen', { ticketId: t.id })}
                >
                  <Text style={styles.otherTicketSubject} numberOfLines={1}>{t.subject}</Text>
                  <Text style={[styles.otherTicketStatus, { color: STATUS_COLOR[t.status] }]}>{t.status}</Text>
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
        renderItem={({ item }) => <MessageBubble msg={item} myId={userId} />}
        contentContainerStyle={styles.messages}
      />

      {/* Action bar above input */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBarBtn} onPress={() => setShowCanned(true)}>
          <Text style={styles.actionBarBtnText}>💬 Шаблоны</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBarBtn, { borderColor: '#10B98140' }]} onPress={() => setShowSubModal(true)}>
          <Text style={[styles.actionBarBtnText, { color: '#10B981' }]}>🎁 Подписка</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBarBtn, ticket.assignedToId === userId && { borderColor: '#10B98160', backgroundColor: '#10B98108' }]}
          onPress={assignToMe}
        >
          <Text style={[styles.actionBarBtnText, ticket.assignedToId === userId && { color: '#10B981' }]}>
            {ticket.assignedToId === userId ? '✓ Взят' : 'Взять'}
          </Text>
        </TouchableOpacity>
        {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
          <TouchableOpacity
            style={[styles.actionBarBtn, { borderColor: '#10B98160' }]}
            onPress={() => changeStatus('resolved')}
          >
            <Text style={[styles.actionBarBtnText, { color: '#10B981' }]}>✓ Решено</Text>
          </TouchableOpacity>
        )}
        {ticket.status !== 'closed' && (
          <TouchableOpacity style={[styles.actionBarBtn, { borderColor: '#6B728060' }]} onPress={quickClose}>
            <Text style={[styles.actionBarBtnText, { color: '#6B7280' }]}>✗ Закрыть</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ответить клиенту..."
          placeholderTextColor="#6B7280"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.sendIcon}>↑</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  meta: { maxHeight: 52, backgroundColor: '#1C1C1E', borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  metaContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6, height: 52 },
  metaUser: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  metaDot: { color: '#3C3C3E', fontSize: 16 },
  chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#2C2C2E', borderWidth: 1, borderColor: 'transparent' },
  chipText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  subjectBar: { padding: 12, backgroundColor: '#1C1C1E', borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  subject: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  subjectMeta: { fontSize: 11, color: '#6B7280' },
  assignedMeta: { fontSize: 11, color: '#10B981', fontWeight: '600' },
  category: { fontSize: 11, color: '#6366F1', fontWeight: '600', textTransform: 'uppercase' },
  messages: { padding: 12, gap: 8, paddingBottom: 8 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginBottom: 4 },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#6366F1' },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#1C1C1E' },
  bubbleAuthor: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 4 },
  bubbleText: { fontSize: 15, color: '#FFFFFF', lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'right', marginTop: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8,
    backgroundColor: '#1C1C1E', borderTopWidth: 1, borderTopColor: '#2C2C2E',
  },
  input: {
    flex: 1, backgroundColor: '#2C2C2E', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#FFFFFF', maxHeight: 100,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  sendIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },

  actionBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0F0F0F', borderTopWidth: 1, borderTopColor: '#1C1C1E' },
  actionBarBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#6366F140' },
  actionBarBtnText: { fontSize: 12, color: '#6366F1', fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  cannedItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  cannedText: { fontSize: 14, color: '#D1D5DB', lineHeight: 20 },
  subModalSection: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  subPlanBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#2C2C2E', borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  subPlanText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  subGrantBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  subGrantBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  otherTicketsBtn: { fontSize: 11, color: '#6366F1', fontWeight: '600' },
  otherTicketsList: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#2C2C2E', paddingTop: 6 },
  otherTicketRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#1C1C1E' },
  otherTicketSubject: { fontSize: 12, color: '#D1D5DB', flex: 1, marginRight: 8 },
  otherTicketStatus: { fontSize: 11, fontWeight: '600' },
});
