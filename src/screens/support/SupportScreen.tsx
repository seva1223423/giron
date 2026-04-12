import React, { useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSupportStore } from '../../store/useSupportStore';
import type { SupportTicket, TicketStatus } from '../../types';

type RootStackParamList = {
  SupportScreen: undefined;
  CreateTicketScreen: undefined;
  SupportTicketScreen: { ticketId: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

function TicketCard({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const lastMsg = ticket.messages[ticket.messages.length - 1];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardSubject} numberOfLines={1}>{ticket.subject}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[ticket.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[ticket.status] }]}>
            {STATUS_LABEL[ticket.status]}
          </Text>
        </View>
      </View>
      {lastMsg && (
        <Text style={styles.lastMsg} numberOfLines={2}>
          {lastMsg.isStaff ? 'Поддержка: ' : 'Вы: '}{lastMsg.content}
        </Text>
      )}
      <Text style={styles.cardDate}>
        {new Date(ticket.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </Text>
    </TouchableOpacity>
  );
}

export default function SupportScreen() {
  const navigation = useNavigation<Nav>();
  const { tickets, loading, fetchMyTickets } = useSupportStore();

  useEffect(() => { fetchMyTickets(); }, []);

  const onRefresh = useCallback(() => { fetchMyTickets(); }, []);

  return (
    <View style={styles.container}>
      {loading && tickets.length === 0 ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TicketCard
              ticket={item}
              onPress={() => navigation.navigate('SupportTicketScreen', { ticketId: item.id })}
            />
          )}
          contentContainerStyle={tickets.length === 0 ? styles.empty : styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#6366F1" />}
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Text style={styles.emptyIcon}>🎧</Text>
              <Text style={styles.emptyTitle}>Нет обращений</Text>
              <Text style={styles.emptyText}>Если у вас возник вопрос или проблема — создайте обращение</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateTicketScreen')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+ Новое обращение</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyContent: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardSubject: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', flex: 1, marginRight: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  lastMsg: { fontSize: 13, color: '#9CA3AF', lineHeight: 18, marginBottom: 8 },
  cardDate: { fontSize: 11, color: '#6B7280' },
  fab: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  fabText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
