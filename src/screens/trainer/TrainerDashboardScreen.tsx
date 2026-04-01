import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

export interface TrainerClient {
  id: string;
  name: string;
  age?: number;
  goal?: string;
  level?: string;
  lastVisit?: string;
  totalWorkouts?: number;
  assignedProgram?: string;
  notes?: string;
  phone?: string;
  emoji?: string;
}

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение',
  muscle_gain: 'Набор массы',
  strength: 'Сила',
  endurance: 'Выносливость',
  general_fitness: 'Общая форма',
};

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
  expert: 'Эксперт',
};

const SAMPLE_CLIENTS: TrainerClient[] = [
  { id: '1', name: 'Алексей Смирнов', age: 28, goal: 'muscle_gain', level: 'intermediate', lastVisit: '2026-03-31', totalWorkouts: 42, assignedProgram: 'Толчок-Тяга-Ноги', emoji: '💪', phone: '+7 900 000 0001' },
  { id: '2', name: 'Мария Козлова', age: 24, goal: 'weight_loss', level: 'beginner', lastVisit: '2026-04-01', totalWorkouts: 18, assignedProgram: 'Верх / Низ', emoji: '🏃', phone: '+7 900 000 0002' },
  { id: '3', name: 'Дмитрий Петров', age: 35, goal: 'strength', level: 'advanced', lastVisit: '2026-03-29', totalWorkouts: 87, assignedProgram: 'Стартовая сила', emoji: '🏋️', phone: '+7 900 000 0003' },
];

export const TrainerDashboardScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [clients, setClients] = useState<TrainerClient[]>(SAMPLE_CLIENTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const todayClients = clients.filter((c) => c.lastVisit === today).length;
  const totalWorkoutsAll = clients.reduce((s, c) => s + (c.totalWorkouts || 0), 0);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddClient = () => {
    if (!newName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newClient: TrainerClient = {
      id: Date.now().toString(),
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      totalWorkouts: 0,
      emoji: '🧑',
    };
    setClients((prev) => [...prev, newClient]);
    setNewName('');
    setNewPhone('');
    setShowAddModal(false);
  };

  const handleDeleteClient = (clientId: string, clientName: string) => {
    Alert.alert(
      'Удалить клиента',
      `Убрать ${clientName} из списка?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setClients((prev) => prev.filter((c) => c.id !== clientId));
          },
        },
      ]
    );
  };

  const daysSince = (dateStr?: string) => {
    if (!dateStr) return null;
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'вчера';
    return `${diff} дн. назад`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>Мои клиенты</Text>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); setShowAddModal(true); }}
          style={[styles.addBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40', borderWidth: 1 }]}
        >
          <Text style={[typography.captionMedium, { color: colors.primary }]}>+ Клиент</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats row */}
        <View style={styles.statsRow}>
          <Card style={[styles.statCard, { flex: 1 }]}>
            <Text style={[typography.number, { color: colors.primary, fontSize: 28 }]}>{clients.length}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>клиентов</Text>
          </Card>
          <Card style={[styles.statCard, { flex: 1, marginHorizontal: spacing.sm }]}>
            <Text style={[typography.number, { color: colors.success, fontSize: 28 }]}>{todayClients}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>сегодня</Text>
          </Card>
          <Card style={[styles.statCard, { flex: 1 }]}>
            <Text style={[typography.number, { color: colors.accent, fontSize: 28 }]}>{totalWorkoutsAll}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>всего трен.</Text>
          </Card>
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: colors.textTertiary, marginRight: spacing.sm }}>🔍</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Найти клиента..."
            placeholderTextColor={colors.textTertiary}
            style={[typography.body, { color: colors.text, flex: 1 }]}
          />
        </View>

        {/* Client list */}
        {filteredClients.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
            <Text style={{ fontSize: 40, marginBottom: spacing.md }}>👥</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              {searchQuery ? 'Клиент не найден' : 'Добавьте первого клиента'}
            </Text>
          </Card>
        ) : (
          filteredClients.map((client) => {
            const lastVisitLabel = daysSince(client.lastVisit);
            const isToday = client.lastVisit === today;
            return (
              <TouchableOpacity
                key={client.id}
                onPress={() => navigation.navigate('TrainerClient', { client })}
                onLongPress={() => handleDeleteClient(client.id, client.name)}
                activeOpacity={0.7}
              >
                <Card style={[styles.clientCard, isToday && { borderWidth: 1.5, borderColor: colors.success + '60' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={{ fontSize: 22 }}>{client.emoji || '🧑'}</Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>{client.name}</Text>
                        {isToday && (
                          <View style={[styles.todayBadge, { backgroundColor: colors.success + '20' }]}>
                            <Text style={[typography.caption, { color: colors.success, fontSize: 10 }]}>сегодня</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: 2, flexWrap: 'wrap' }}>
                        {client.goal && (
                          <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            🎯 {GOAL_LABELS[client.goal] ?? client.goal}
                          </Text>
                        )}
                        {client.level && (
                          <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            📊 {LEVEL_LABELS[client.level] ?? client.level}
                          </Text>
                        )}
                      </View>
                      {client.assignedProgram && (
                        <Text style={[typography.caption, { color: colors.primary, marginTop: 2 }]}>
                          📋 {client.assignedProgram}
                        </Text>
                      )}
                    </View>

                    {/* Right side */}
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[typography.numberSmall, { color: colors.primary, fontSize: 18 }]}>
                        {client.totalWorkouts || 0}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>трен.</Text>
                      {lastVisitLabel && (
                        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2, fontSize: 10 }]}>
                          {lastVisitLabel}
                        </Text>
                      )}
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg }]}>
          Удержите карточку клиента для удаления
        </Text>
      </ScrollView>

      {/* Add Client Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Новый клиент
            </Text>

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              ИМЯ И ФАМИЛИЯ *
            </Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Иван Иванов"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              autoFocus
            />

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md }]}>
              ТЕЛЕФОН
            </Text>
            <TextInput
              value={newPhone}
              onChangeText={setNewPhone}
              placeholder="+7 900 000 0000"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
            />

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => { setShowAddModal(false); setNewName(''); setNewPhone(''); }}
                style={{ flex: 1 }}
              />
              <Button
                title="Добавить"
                onPress={handleAddClient}
                style={{ flex: 1 }}
                disabled={!newName.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
  },
  addBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  statCard: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  clientCard: {
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 48,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
});
