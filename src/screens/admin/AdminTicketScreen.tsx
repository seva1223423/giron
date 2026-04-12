import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { NativeStackRouteProp } from '@react-navigation/native-stack';
import { supportService } from '../../services/supportService';
import { adminService } from '../../services/adminService';
import { useAuthStore } from '../../store/useAuthStore';
import type { SupportTicket, SupportMessage, TicketStatus, TicketPriority } from '../../types';

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
  const route = useRoute<NativeStackRouteProp<{ AdminTicketScreen: RouteParams }, 'AdminTicketScreen'>>();
  const { ticketId } = route.params;
  const userId = useAuthStore((s) => s.user?.id);
  const flatRef = useRef<FlatList>(null);

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportService.getTicket(ticketId);
      setTicket(data);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, []);

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

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!ticket) return <View style={styles.center}><Text style={{ color: '#9CA3AF' }}>Тикет не найден</Text></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {/* Ticket meta */}
      <ScrollView style={styles.meta} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metaContent}>
        <Text style={styles.metaUser}>👤 {ticket.user?.firstName} {ticket.user?.lastName}</Text>
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
        <Text style={styles.subject} numberOfLines={2}>{ticket.subject}</Text>
        <Text style={styles.category}>{ticket.category}</Text>
      </View>

      <FlatList
        ref={flatRef}
        data={ticket.messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble msg={item} myId={userId} />}
        contentContainerStyle={styles.messages}
      />

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
  subjectBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#1C1C1E', borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  subject: { flex: 1, fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginRight: 8 },
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
});
