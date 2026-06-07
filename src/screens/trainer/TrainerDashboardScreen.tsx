import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors, useTrainerStore } from '../../store';
import { Card, PaywallModal } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { AddClientModal, ClientCard } from './components';
import { useSubscriptionStore, FREE_LIMITS } from '../../store/useSubscriptionStore';
import { localDateStr } from '../../utils/date';

export const TrainerDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const { clients, deleteClient, fetchClients } = useTrainerStore();
  const { canAddTrainerClient } = useSubscriptionStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { fetchClients(); }, []);

  const today = localDateStr(new Date());
  const todayClients = clients.filter((c) => c.lastVisit === today).length;
  const totalWorkoutsAll = clients.reduce((s, c) => s + (c.totalWorkouts || 0), 0);
  const filteredClients = clients.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleDeleteClient = (clientId: string, clientName: string) => {
    Alert.alert('Удалить клиента', `Убрать ${clientName} из списка?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { haptic.medium(); deleteClient(clientId); } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>Мои клиенты</Text>
        <TouchableOpacity
          onPress={() => {
            haptic.selection();
            if (canAddTrainerClient(clients.length)) {
              setShowAddModal(true);
            } else {
              setShowPaywall(true);
            }
          }}
          style={[styles.addBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40', borderWidth: 1 }]}
        >
          <Text style={[typography.captionMedium, { color: colors.primary }]}>+ Клиент</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          {[
            { value: clients.length, label: 'клиентов', color: colors.primary },
            { value: todayClients, label: 'сегодня', color: colors.success },
            { value: totalWorkoutsAll, label: 'всего трен.', color: colors.accent },
          ].map(({ value, label, color }, i) => (
            <Card key={label} style={[styles.statCard, { flex: 1, marginHorizontal: i === 1 ? spacing.sm : 0 }]}>
              <Text style={[typography.number, { color, fontSize: 28 }]}>{value}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
            </Card>
          ))}
        </View>

        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textTertiary, marginRight: spacing.sm, fontWeight: '600' }}>Q</Text>
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Найти клиента..." placeholderTextColor={colors.textTertiary} style={[typography.body, { color: colors.text, flex: 1 }]} />
        </View>

        {filteredClients.length === 0
          ? <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Text style={{ fontSize: 40, marginBottom: spacing.md }}>👥</Text>
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                {searchQuery ? 'Клиент не найден' : 'Добавьте первого клиента'}
              </Text>
            </Card>
          : filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onPress={() => navigation.navigate('TrainerClient', { client })}
                onLongPress={() => handleDeleteClient(client.id, client.name)}
              />
            ))
        }

        <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg }]}>
          Удержите карточку клиента для удаления
        </Text>
      </ScrollView>

      <AddClientModal visible={showAddModal} onClose={() => setShowAddModal(false)} />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="feature"
        featureName={`Максимум ${FREE_LIMITS.TRAINER_CLIENTS} клиента бесплатно`}
        navigation={navigation}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  addBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.md },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  statsRow: { flexDirection: 'row', marginBottom: spacing.lg },
  statCard: { alignItems: 'center', paddingVertical: spacing.md },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.lg },
});
