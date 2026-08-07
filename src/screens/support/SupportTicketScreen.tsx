import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useSupportStore } from '../../store/useSupportStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeColors } from '../../store';
import { useSafeBottom } from '../../hooks/useSafeBottom';
import type { SupportMessage, TicketStatus } from '../../types';

type RouteParams = { ticketId: string };

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Открыто',
  in_progress: 'В работе',
  resolved: 'Решено',
  closed: 'Закрыто',
};

function MessageBubble({ msg, isMe }: { msg: SupportMessage; isMe: boolean }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.bubble, isMe ? [styles.bubbleMe, { backgroundColor: colors.primary }] : [styles.bubbleStaff, { backgroundColor: colors.surface }]]}>
      {!isMe && (
        <Text style={[styles.bubbleAuthor, { color: colors.textSecondary }]}>
          {msg.isStaff ? '🎧 Поддержка' : msg.author.firstName}
        </Text>
      )}
      <Text style={[styles.bubbleText, { color: isMe ? colors.textInverse : colors.text }]}>{msg.content}</Text>
      <Text style={[styles.bubbleTime, { color: colors.textSecondary }]}>
        {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

export default function SupportTicketScreen() {
  const route = useRoute<RouteProp<{ SupportTicketScreen: RouteParams }, 'SupportTicketScreen'>>();
  const navigation = useNavigation();
  const colors = useThemeColors();
  const { ticketId } = route.params ?? {};

  const STATUS_COLOR: Record<TicketStatus, string> = {
    open: colors.primary,
    in_progress: colors.warning,
    resolved: colors.success,
    closed: colors.textTertiary,
  };

  const { activeTicket, loading, sending, fetchTicket, sendMessage, closeTicket } = useSupportStore();
  const userId = useAuthStore((s) => s.user?.id);
  const safeBottom = useSafeBottom();
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
    return <ActivityIndicator style={styles.center} color={colors.primary} size="large" />;
  }

  if (!activeTicket) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.textSecondary }}>Обращение не найдено</Text>
      </View>
    );
  }

  const isClosed = activeTicket.status === 'closed' || activeTicket.status === 'resolved';

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {/* Header info */}
      <View style={[styles.ticketInfo, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.ticketSubject, { color: colors.text }]} numberOfLines={2}>{activeTicket.subject}</Text>
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
        <View style={[styles.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.border, color: colors.text }]}
            placeholder="Написать сообщение..."
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
            activeOpacity={0.7}
          >
            {sending
              ? <ActivityIndicator color={colors.textInverse} size="small" />
              : <Text style={[styles.sendIcon, { color: colors.textInverse }]}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.closedBanner, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: safeBottom + 16 }]}>
          <Text style={[styles.closedText, { color: colors.textTertiary }]}>Обращение закрыто</Text>
        </View>
      )}

      {!isClosed && (
        <TouchableOpacity style={[styles.closeBtn, { paddingBottom: safeBottom + 12 }]} onPress={handleClose}>
          <Text style={[styles.closeBtnText, { color: colors.error }]}>Закрыть обращение</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  ticketInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  ticketSubject: { flex: 1, fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  messages: { padding: 16, paddingBottom: 8, gap: 8 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
    marginBottom: 4,
  },
  bubbleMe: { alignSelf: 'flex-end' },
  bubbleStaff: { alignSelf: 'flex-start' },
  bubbleAuthor: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 10, textAlign: 'right', marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendIcon: { fontSize: 20, fontWeight: '700' },
  closedBanner: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  closedText: { fontSize: 14 },
  closeBtn: { padding: 12, alignItems: 'center' },
  closeBtnText: { fontSize: 13 },
});
