import React, { useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSupportStore } from '../../store/useSupportStore';
import { useThemeColors } from '../../store';
import { useSafeBottom } from '../../hooks/useSafeBottom';
import type { SupportTicket, TicketStatus } from '../../types';
import { contentMaxWidth } from '../../theme/spacing';

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

function TicketCard({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const colors = useThemeColors();
  const STATUS_COLOR: Record<TicketStatus, string> = {
    open: colors.primary,
    in_progress: colors.warning,
    resolved: colors.success,
    closed: colors.textTertiary,
  };
  const lastMsg = ticket.messages[ticket.messages.length - 1];
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardSubject, { color: colors.text }]} numberOfLines={1}>{ticket.subject}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[ticket.status] + '22', borderWidth: 1, borderColor: STATUS_COLOR[ticket.status] + '40' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[ticket.status] }]}>
            {STATUS_LABEL[ticket.status]}
          </Text>
        </View>
      </View>
      {lastMsg && (
        <Text style={[styles.lastMsg, { color: colors.textSecondary }]} numberOfLines={2}>
          {lastMsg.isStaff ? 'Поддержка: ' : 'Вы: '}{lastMsg.content}
        </Text>
      )}
      <Text style={[styles.cardDate, { color: colors.textTertiary }]}>
        {new Date(ticket.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </Text>
    </TouchableOpacity>
  );
}

export default function SupportScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useThemeColors();
  const safeBottom = useSafeBottom();
  const { tickets, loading, fetchMyTickets } = useSupportStore();

  useEffect(() => { fetchMyTickets(); }, []);

  const onRefresh = useCallback(() => { fetchMyTickets(); }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {loading && tickets.length === 0 ? (
        <ActivityIndicator style={styles.center} color={colors.primary} size="large" />
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
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Text style={styles.emptyIcon}>🎧</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Нет обращений</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Если у вас возник вопрос или проблема — создайте обращение</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: safeBottom + 24 }]}
        onPress={() => navigation.navigate('CreateTicketScreen')}
        activeOpacity={0.8}
      >
        <Text style={[styles.fabText, { color: colors.textInverse }]}>+ Новое обращение</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 100, width: '100%', maxWidth: contentMaxWidth.tablet, alignSelf: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyContent: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardSubject: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  lastMsg: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  cardDate: { fontSize: 11 },
  fab: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  fabText: { fontSize: 16, fontWeight: '700' },
});
