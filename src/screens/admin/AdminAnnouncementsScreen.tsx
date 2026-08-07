import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity,
  RefreshControl, Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { Icon } from '../../components';
import { adminService } from '../../services/adminService';
import type { Announcement, AnnouncementType } from '../../types';

const TYPE_META: Record<AnnouncementType, { color: string; icon: import('../../components/Icon').IconName; label: string }> = {
  info:        { color: '#D4B07A', icon: 'news' as const, label: 'Инфо' },
  warning:     { color: '#E8A36A', icon: 'bell' as const, label: 'Предупреждение' },
  maintenance: { color: '#E07A6B', icon: 'settings' as const, label: 'Тех. работы' },
  promo:       { color: '#9AC28C', icon: 'spark' as const, label: 'Акция' },
};

const TYPES: AnnouncementType[] = ['info', 'warning', 'maintenance', 'promo'];

function AnnouncementCard({
  item, onToggle, onDelete, onEdit, onDuplicate,
}: {
  item: Announcement;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
}) {
  const meta = TYPE_META[item.type];
  const isExpired = item.endsAt && new Date(item.endsAt) < new Date();
  return (
    <View style={[styles.card, !item.isActive && styles.cardInactive, isExpired && styles.cardExpired]}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeBadge, { backgroundColor: meta.color + '22' }]}>
          <Icon name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardBtn} onPress={onEdit}>
            <Text style={[styles.cardBtnText, { color: '#D4B07A' }]}>Ред.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardBtn} onPress={onDuplicate}>
            <Text style={[styles.cardBtnText, { color: '#D4B07A' }]}>Копия</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardBtn} onPress={onToggle}>
            <Text style={[styles.cardBtnText, { color: item.isActive ? '#9AC28C' : '#A8A49C' }]}>
              {item.isActive ? 'Активно' : 'Выкл'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cardBtn, { borderColor: '#E07A6B40' }]} onPress={onDelete}>
            <Text style={[styles.cardBtnText, { color: '#E07A6B' }]}>Удалить</Text>
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
            <Text style={styles.cardMeta}>{item.viewCount} просмотров</Text>
          )}
          {item.targetRole && (
            <Text style={[styles.cardMeta, { color: '#E8A36A' }]}>{item.targetRole}</Text>
          )}
        </View>
        {item.endsAt && (
          <Text style={[styles.cardMeta, isExpired && { color: '#E07A6B' }]}>
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
  const [editItem, setEditItem] = useState<Announcement | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formType, setFormType] = useState<AnnouncementType>('info');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formTarget, setFormTarget] = useState<string>('');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  const audienceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setFormTitle(''); setFormBody(''); setFormType('info'); setFormEndsAt(''); setFormTarget('');
    setEditItem(null);
    setAudienceCount(null);
  }, []);

  // Fetch audience count whenever target changes
  const handleTargetChange = useCallback((target: string) => {
    setFormTarget(target);
    setAudienceCount(null);
    if (audienceTimer.current) clearTimeout(audienceTimer.current);
    audienceTimer.current = setTimeout(async () => {
      try {
        const { count } = await adminService.getAnnouncementAudience(target || undefined);
        setAudienceCount(count);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const openEdit = useCallback((item: Announcement) => {
    setEditItem(item);
    setFormTitle(item.title);
    setFormBody(item.body);
    setFormType(item.type);
    setFormEndsAt(item.endsAt ? new Date(item.endsAt).toISOString().split('T')[0] : '');
    const target = item.targetRole ?? '';
    setFormTarget(target);
    setShowForm(true);
    // Fetch audience count for existing target
    adminService.getAnnouncementAudience(target || undefined)
      .then(({ count }) => setAudienceCount(count))
      .catch(() => {});
  }, []);

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

  const handleSubmit = useCallback(async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      Alert.alert('Ошибка', 'Заполните заголовок и текст');
      return;
    }
    setBusy(true);
    try {
      if (editItem) {
        await adminService.updateAnnouncement(editItem.id, {
          title: formTitle.trim(),
          body: formBody.trim(),
          type: formType,
          endsAt: formEndsAt.trim() || undefined,
          targetRole: formTarget || undefined,
        } as any);
      } else {
        await adminService.createAnnouncement({
          title: formTitle.trim(),
          body: formBody.trim(),
          type: formType,
          endsAt: formEndsAt.trim() || undefined,
          targetRole: formTarget || undefined,
        } as any);
      }
      setShowForm(false);
      resetForm();
      await load();
    } catch {
      Alert.alert('Ошибка', editItem ? 'Не удалось обновить объявление' : 'Не удалось создать объявление');
    } finally {
      setBusy(false);
    }
  }, [formTitle, formBody, formType, formEndsAt, formTarget, editItem, load, resetForm]);

  const handleToggle = useCallback(async (item: Announcement) => {
    try {
      await adminService.updateAnnouncement(item.id, { isActive: !item.isActive });
      setItems((prev) => prev.map((a) => a.id === item.id ? { ...a, isActive: !a.isActive } : a));
    } catch {
      Alert.alert('Ошибка', 'Не удалось обновить статус');
    }
  }, []);

  const handleDuplicate = useCallback(async (item: Announcement) => {
    try {
      const copy = await adminService.duplicateAnnouncement(item.id);
      setItems((prev) => [copy, ...prev]);
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать объявление');
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
      {/* Create/Edit modal */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editItem ? 'Редактировать объявление' : 'Новое объявление'}</Text>
                <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }}>
                  <Text style={{ color: '#A8A49C', fontSize: 16 }}>✕</Text>
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
                      <Icon name={m.icon} size={14} color={m.color} />
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
                placeholderTextColor="#2A2A2F"
                maxLength={200}
              />

              <Text style={styles.fieldLabel}>Текст *</Text>
              <TextInput
                style={[styles.fieldInput, { minHeight: 100 }]}
                value={formBody}
                onChangeText={setFormBody}
                placeholder="Текст объявления..."
                placeholderTextColor="#2A2A2F"
                multiline
                maxLength={2000}
              />

              <Text style={styles.fieldLabel}>Аудитория (необязательно)</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {[{ key: '', label: 'Все' }, { key: 'free', label: 'Free' }, { key: 'pro', label: 'PRO' }, { key: 'trainer', label: 'Trainer' }, { key: 'club', label: 'Club' }].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.typeBtn, formTarget === opt.key && { backgroundColor: '#D4B07A22', borderColor: '#D4B07A' }]}
                    onPress={() => handleTargetChange(opt.key)}
                  >
                    <Text style={[styles.typeBtnText, formTarget === opt.key && { color: '#D4B07A' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {audienceCount !== null && (
                <Text style={{ fontSize: 11, color: '#D4B07A', marginBottom: 10, fontWeight: '600' }}>
                  Охват: ~{audienceCount} {audienceCount === 1 ? 'пользователь' : audienceCount < 5 ? 'пользователя' : 'пользователей'}
                </Text>
              )}

              <Text style={styles.fieldLabel}>Действует до (необязательно)</Text>
              <TextInput
                style={styles.fieldInput}
                value={formEndsAt}
                onChangeText={setFormEndsAt}
                placeholder="2026-12-31 (YYYY-MM-DD)"
                placeholderTextColor="#2A2A2F"
              />

              <TouchableOpacity style={styles.createBtn} onPress={handleSubmit} disabled={busy}>
                {busy
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.createBtnText}>{editItem ? 'Сохранить изменения' : 'Опубликовать'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Header action */}
      <View style={styles.topBar}>
        <Text style={styles.topLabel}>Объявлений: {items.length}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ Новое</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.center} color="#D4B07A" size="large" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#D4B07A" />}
          renderItem={({ item }) => (
            <AnnouncementCard
              item={item}
              onToggle={() => handleToggle(item)}
              onDelete={() => handleDelete(item)}
              onEdit={() => openEdit(item)}
              onDuplicate={() => handleDuplicate(item)}
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
  container: { flex: 1, backgroundColor: '#0E0E0F' },
  center: { flex: 1, justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#17171A' },
  topLabel: { fontSize: 12, color: '#A8A49C' },
  addBtn: { backgroundColor: '#D4B07A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#17171A', fontWeight: '700', fontSize: 13 },
  list: { padding: 12, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#A8A49C', marginTop: 40, fontSize: 15 },

  card: { backgroundColor: '#17171A', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1E1E22' },
  cardInactive: { opacity: 0.55 },
  cardExpired: { borderColor: '#E07A6B30' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 6 },
  cardBtn: { borderRadius: 6, borderWidth: 1, borderColor: '#1E1E22', paddingHorizontal: 8, paddingVertical: 3 },
  cardBtnText: { fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  cardBody: { fontSize: 13, color: '#A8A49C', lineHeight: 18, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cardMeta: { fontSize: 11, color: '#2A2A2F' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#17171A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  fieldLabel: { fontSize: 11, color: '#A8A49C', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  fieldInput: { backgroundColor: '#0E0E0F', borderRadius: 8, padding: 12, fontSize: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#2A2A2F' },
  typeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, borderColor: '#1E1E22', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0E0E0F' },
  typeBtnText: { fontSize: 12, color: '#A8A49C', fontWeight: '600' },
  createBtn: { backgroundColor: '#D4B07A', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16, marginBottom: 8 },
  createBtnText: { color: '#17171A', fontWeight: '700', fontSize: 15 },
});
