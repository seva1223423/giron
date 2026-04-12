import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  RefreshControl, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { adminService } from '../../services/adminService';
import type { Announcement, AnnouncementType } from '../../types';

const TYPE_META: Record<AnnouncementType, { color: string; icon: string; label: string }> = {
  info:        { color: '#6366F1', icon: 'ℹ️', label: 'Инфо' },
  warning:     { color: '#F59E0B', icon: '⚠️', label: 'Предупреждение' },
  maintenance: { color: '#EF4444', icon: '🔧', label: 'Тех. работы' },
  promo:       { color: '#10B981', icon: '🎁', label: 'Акция' },
};

const TYPES: AnnouncementType[] = ['info', 'warning', 'maintenance', 'promo'];

function AnnouncementCard({
  item, onToggle, onDelete,
}: {
  item: Announcement;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[item.type];
  const isExpired = item.endsAt && new Date(item.endsAt) < new Date();
  return (
    <View style={[styles.card, !item.isActive && styles.cardInactive, isExpired && styles.cardExpired]}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: meta.color + '22' }]}>
          <Text style={{ fontSize: 12 }}>{meta.icon}</Text>
          <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardBtn} onPress={onToggle}>
            <Text style={[styles.cardBtnText, { color: item.isActive ? '#10B981' : '#6B7280' }]}>
              {item.isActive ? 'Активно' : 'Выкл'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cardBtn, { borderColor: '#EF444440' }]} onPress={onDelete}>
            <Text style={[styles.cardBtnText, { color: '#EF4444' }]}>Удалить</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>
      <View style={styles.cardFooter}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={styles.cardMeta}>
            {new Date(item.createdAt).toLocaleDateString('ru-RU')}
            {item.author ? ` · ${item.author.firstName}` : ''}
          </Text>
          {(item.viewCount ?? 0) > 0 && (
            <Text style={styles.cardMeta}>👁 {item.viewCount}</Text>
          )}
          {item.targetRole && (
            <Text style={[styles.cardMeta, { color: '#F59E0B' }]}>🎯 {item.targetRole}</Text>
          )}
        </View>
        {item.endsAt && (
          <Text style={[styles.cardMeta, isExpired && { color: '#EF4444' }]}>
            до {new Date(item.endsAt).toLocaleDateString('ru-RU')}
            {isExpired ? ' (истёкло)' : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function AdminAnnouncementsScreen() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formType, setFormType] = useState<AnnouncementType>('info');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formTarget, setFormTarget] = useState<string>('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await adminService.getAnnouncements();
      setItems(data);
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить объявления');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = useCallback(async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      Alert.alert('Ошибка', 'Заполните заголовок и текст');
      return;
    }
    setBusy(true);
    try {
      await adminService.createAnnouncement({
        title: formTitle.trim(),
        body: formBody.trim(),
        type: formType,
        endsAt: formEndsAt.trim() || undefined,
        targetRole: formTarget || undefined,
      } as any);
      setShowForm(false);
      setFormTitle(''); setFormBody(''); setFormType('info'); setFormEndsAt(''); setFormTarget('');
      await load();
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать объявление');
    } finally {
      setBusy(false);
    }
  }, [formTitle, formBody, formType, formEndsAt, load]);

  const handleToggle = useCallback(async (item: Announcement) => {
    try {
      await adminService.updateAnnouncement(item.id, { isActive: !item.isActive });
      setItems((prev) => prev.map((a) => a.id === item.id ? { ...a, isActive: !a.isActive } : a));
    } catch {
      Alert.alert('Ошибка', 'Не удалось обновить статус');
    }
  }, []);

  const handleDelete = useCallback((item: Announcement) => {
    Alert.alert(
      'Удалить объявление?',
      item.title,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminService.deleteAnnouncement(item.id);
              setItems((prev) => prev.filter((a) => a.id !== item.id));
            } catch {
              Alert.alert('Ошибка', 'Не удалось удалить');
            }
          },
        },
      ]
    );
  }, []);

  return (
    <View style={styles.container}>
      {/* Create modal */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Новое объявление</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Тип</Text>
              <View style={styles.typeRow}>
                {TYPES.map((t) => {
                  const m = TYPE_META[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, formType === t && { backgroundColor: m.color + '22', borderColor: m.color }]}
                      onPress={() => setFormType(t)}
                    >
                      <Text style={{ fontSize: 14 }}>{m.icon}</Text>
                      <Text style={[styles.typeBtnText, formType === t && { color: m.color }]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Заголовок *</Text>
              <TextInput
                style={styles.fieldInput}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="Заголовок объявления..."
                placeholderTextColor="#4B5563"
                maxLength={200}
              />

              <Text style={styles.fieldLabel}>Текст *</Text>
              <TextInput
                style={[styles.fieldInput, { minHeight: 100 }]}
                value={formBody}
                onChangeText={setFormBody}
                placeholder="Текст объявления..."
                placeholderTextColor="#4B5563"
                multiline
                maxLength={2000}
              />

              <Text style={styles.fieldLabel}>Аудитория (необязательно)</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {[{ key: '', label: 'Все' }, { key: 'free', label: 'Free' }, { key: 'pro', label: 'PRO' }, { key: 'trainer', label: 'Trainer' }, { key: 'club', label: 'Club' }].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.typeBtn, formTarget === opt.key && { backgroundColor: '#6366F122', borderColor: '#6366F1' }]}
                    onPress={() => setFormTarget(opt.key)}
                  >
                    <Text style={[styles.typeBtnText, formTarget === opt.key && { color: '#6366F1' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Действует до (необязательно)</Text>
              <TextInput
                style={styles.fieldInput}
                value={formEndsAt}
                onChangeText={setFormEndsAt}
                placeholder="2026-12-31 (YYYY-MM-DD)"
                placeholderTextColor="#4B5563"
              />

              <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={busy}>
                {busy
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.createBtnText}>Опубликовать</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Header action */}
      <View style={styles.topBar}>
        <Text style={styles.topLabel}>Объявлений: {items.length}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.addBtnText}>+ Новое</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#6366F1" size="large" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366F1" />}
          renderItem={({ item }) => (
            <AnnouncementCard
              item={item}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDelete(item)}
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Нет объявлений</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1C1C1E' },
  topLabel: { fontSize: 12, color: '#6B7280' },
  addBtn: { backgroundColor: '#6366F1', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  list: { padding: 12, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 15 },

  card: { backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2C2C2E' },
  cardInactive: { opacity: 0.55 },
  cardExpired: { borderColor: '#EF444430' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 6 },
  cardBtn: { borderRadius: 6, borderWidth: 1, borderColor: '#2C2C2E', paddingHorizontal: 8, paddingVertical: 3 },
  cardBtnText: { fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  cardBody: { fontSize: 13, color: '#9CA3AF', lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardMeta: { fontSize: 11, color: '#4B5563' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  fieldLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  fieldInput: { backgroundColor: '#0F0F0F', borderRadius: 8, padding: 12, fontSize: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#3C3C3E' },
  typeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, borderColor: '#2C2C2E', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0F0F0F' },
  typeBtnText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  createBtn: { backgroundColor: '#6366F1', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16, marginBottom: 8 },
  createBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
