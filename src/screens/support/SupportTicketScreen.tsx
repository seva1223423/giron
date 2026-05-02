import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSupportStore } from '../../store/useSupportStore';
import { useAuthStore } from '../../store/useAuthStore';
import type { SupportMessage, TicketStatus } from '../../types';

type RouteParams = { ticketId: string };

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Открыто',
  in_progress: 'В работе',
  resolved: 'Решено',
  closed: 'Закрыто',
};
const STATUS_COLOR: Record<TicketStatus, string> = {
  open: '#EF4444',
  in_progress: '#F59E0B',
  resolved: '#10B981',
  closed: '#6B7280',
};

function MessageBubble({ msg, isMe }: { msg: SupportMessage; isMe: boolean }) {
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleStaff]}>
      {!isMe && (
        <Text style={styles.bubbleAuthor}>
          {msg.isStaff ? '🎧 Поддержка' : msg.author.firstName}
        </Text>
      )}
      <Text style={styles.bubbleText}>{msg.content}</Text>
      <Text style={styles.bubbleTime}>
        {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

export default function SupportTicketScreen() {
  const route = useRoute<RouteProp<{ SupportTicketScreen: RouteParams }, 'SupportTicketScreen'>>();
  const navigation = useNavigation();
  const { ticketId } = route.params ?? {};

  const { activeTicket, loading, sending, fetchTicket, sendMessage, closeTicket } = useSupportStore();
  const userId = useAuthStore((s) => s.user?.id);
  const flatRef = useRef<FlatList>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    fetchTicket(ticketId);
    navigation.setOptions({ title: 'Обращение' });
  }, [ticketId]);

  useEffect(() => {
    if (activeTicket?.messages.length) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [activeTicket?.messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    await sendMessage(ticketId, trimmed);
    const sendError = useSupportStore.getState().error;
    if (sendError) {
      Alert.alert('Ошибка', sendError);
    } else {
      setText('');
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [text, sending, ticketId]);

  const handleClose = useCallback(() => {
    Alert.alert('Закрыть обращение?', 'После закрытия вы не сможете отправлять сообщения.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Закрыть',
        style: 'destructive',
        onPress: async () => {
          await closeTicket(ticketId);
          const closeError = useSupportStore.getState().error;
          if (closeError) Alert.alert('Ошибка', 'Не удалось закрыть обращение. Попробуйте ещё раз.');
        },
      },
    ]);
  }, [ticketId]);

  if (loading && !activeTicket) {
    return <ActivityIndicator style={styles.center} color="#D4B07A" size="large" />;
  }

  if (!activeTicket) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#9CA3AF' }}>Обращение не найдено</Text>
      </View>
    );
  }

  const isClosed = activeTicket.status === 'closed' || activeTicket.status === 'resolved';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {/* Header info */}
      <View style={styles.ticketInfo}>
        <Text style={styles.ticketSubject} numberOfLines={2}>{activeTicket.subject}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[activeTicket.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[activeTicket.status] }]}>
            {STATUS_LABEL[activeTicket.status]}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={activeTicket.messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MessageBubble msg={item} isMe={item.authorId === userId} />
        )}
        contentContainerStyle={styles.messages}
      />

      {!isClosed ? (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Написать сообщение..."
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
            activeOpacity={0.7}
          >
            {sending
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <Text style={styles.sendIcon}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>Обращение закрыто</Text>
        </View>
      )}

      {!isClosed && (
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
          <Text style={styles.closeBtnText}>Закрыть обращение</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  ticketInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1C1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    gap: 12,
  },
  ticketSubject: { flex: 1, fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  messages: { padding: 16, paddingBottom: 8, gap: 8 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 4,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#D4B07A' },
  bubbleStaff: { alignSelf: 'flex-start', backgroundColor: '#1C1C1E' },
  bubbleAuthor: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 4 },
  bubbleText: { fontSize: 15, color: '#FFFFFF', lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'right', marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  input: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D4B07A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  closedBanner: {
    padding: 16,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  closedText: { color: '#6B7280', fontSize: 14 },
  closeBtn: { padding: 12, alignItems: 'center' },
  closeBtnText: { color: '#EF4444', fontSize: 13 },
});
