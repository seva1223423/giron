import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { adminService } from '../../services/adminService';
import type { AdminUserDetail, UserRole } from '../../types';

type RouteParams = { userId: string };

const ROLES: UserRole[] = ['guest', 'visitor', 'client', 'trainer', 'support', 'admin'];
const PLANS = [
  { key: 'free', label: 'Free', color: '#6B7280' },
  { key: 'pro', label: 'PRO', color: '#6366F1' },
  { key: 'trainer', label: 'Trainer', color: '#F59E0B' },
  { key: 'club', label: 'Club', color: '#10B981' },
] as const;

type Plan = typeof PLANS[number]['key'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function AdminUserDetailScreen() {
  const route = useRoute<RouteProp<{ AdminUserDetailScreen: RouteParams }, 'AdminUserDetailScreen'>>();
  const { userId } = route.params;

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getUser(userId);
      setUser(data);
      setNoteText(data.adminNote ?? '');
    } catch {
      Alert.alert('Ошибка', 'Не удалось загрузить данные пользователя');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, []);

  const changeRole = useCallback((newRole: UserRole) => {
    Alert.alert(
      'Изменить роль?',
      `Роль пользователя ${user?.firstName} будет изменена на "${newRole.toUpperCase()}"`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Изменить',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserRole(userId, newRole.toUpperCase());
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось изменить роль');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const grantPlan = useCallback((plan: Plan) => {
    const planInfo = PLANS.find((p) => p.key === plan)!;
    Alert.alert(
      `Выдать "${planInfo.label}"?`,
      `${user?.firstName} ${user?.lastName ?? ''} получит доступ к плану ${planInfo.label}.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выдать',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(userId, { plan, status: 'active' });
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось выдать подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const extendSubscription = useCallback((days: number) => {
    if (!user) return;
    const userSub = user.subscription;
    const plan = (userSub?.plan ?? 'free') as Plan;
    const active = userSub?.status === 'active' && plan !== 'free';
    if (!active) return;
    const base = userSub?.endDate ? new Date(userSub.endDate) : new Date();
    base.setDate(base.getDate() + days);
    const newEnd = base.toISOString().split('T')[0];
    Alert.alert(
      `Продлить на ${days} дней?`,
      `Новая дата окончания: ${new Date(newEnd).toLocaleDateString('ru-RU')}`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Продлить',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(userId, {
                plan: plan as any,
                status: 'active',
                endDate: newEnd,
              });
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось продлить подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const revokeSubscription = useCallback(() => {
    Alert.alert(
      'Отозвать подписку?',
      `${user?.firstName} ${user?.lastName ?? ''} будет переведён на бесплатный план. Это действие нельзя отменить автоматически.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отозвать',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.changeUserSubscription(userId, { plan: 'free', status: 'cancelled' });
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось отозвать подписку');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const banUser = useCallback(() => {
    Alert.prompt(
      'Заблокировать пользователя',
      `Укажи причину блокировки ${user?.firstName}:`,
      async (reason) => {
        if (!reason?.trim()) return;
        setBusy(true);
        try {
          await adminService.banUser(userId, reason.trim());
          await load();
        } catch {
          Alert.alert('Ошибка', 'Не удалось заблокировать пользователя');
        } finally {
          setBusy(false);
        }
      },
      'plain-text'
    );
  }, [userId, user, load]);

  const unbanUser = useCallback(() => {
    Alert.alert(
      'Разблокировать?',
      `${user?.firstName} ${user?.lastName ?? ''} получит доступ обратно.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Разблокировать',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.unbanUser(userId);
              await load();
            } catch {
              Alert.alert('Ошибка', 'Не удалось разблокировать');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user, load]);

  const saveNote = useCallback(async () => {
    setBusy(true);
    try {
      await adminService.setAdminNote(userId, noteText);
      setEditingNote(false);
      setUser((u) => u ? { ...u, adminNote: noteText || undefined } : u);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить заметку');
    } finally {
      setBusy(false);
    }
  }, [userId, noteText]);

  const deleteUserAccount = useCallback(() => {
    Alert.alert(
      'Удалить аккаунт?',
      `Аккаунт ${user?.firstName} будет анонимизирован. Это необратимо.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await adminService.deleteUser(userId);
              Alert.alert('Готово', 'Аккаунт удалён');
            } catch {
              Alert.alert('Ошибка', 'Не удалось удалить аккаунт');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [userId, user]);

  if (loading) return <ActivityIndicator style={styles.center} color="#6366F1" size="large" />;
  if (!user) return null;

  const sub = user.subscription;
  const currentPlan: Plan = (sub?.plan as Plan) ?? 'free';
  const isActiveSub = sub?.status === 'active' && currentPlan !== 'free';
  // Server returns Prisma enum values (uppercase); normalize for comparisons
  const roleLower = user.role.toLowerCase() as typeof user.role;

  // Engagement score: weighted sum of activity signals (0–100)
  const engagementScore = Math.min(100, Math.round(
    Math.min(user._count.workouts * 3, 40) +          // up to 40 pts for workouts
    Math.min(user._count.chatMessages * 1.5, 25) +    // up to 25 pts for AI usage
    Math.min(user._count.meals * 0.5, 20) +           // up to 20 pts for nutrition
    Math.min(user._count.cardioSessions * 2, 15)      // up to 15 pts for cardio
  ));
  const engagementColor = engagementScore >= 70 ? '#10B981' : engagementScore >= 40 ? '#F59E0B' : '#EF4444';
  const engagementLabel = engagementScore >= 70 ? 'Высокий' : engagementScore >= 40 ? 'Средний' : 'Низкий';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color="#6366F1" size="large" />
        </View>
      )}

      {/* Ban banner */}
      {user.isBanned && (
        <View style={styles.banBanner}>
          <Text style={styles.banBannerTitle}>⛔ Заблокирован</Text>
          {user.banReason && <Text style={styles.banBannerReason}>{user.banReason}</Text>}
          {user.bannedAt && <Text style={styles.banBannerDate}>с {new Date(user.bannedAt).toLocaleDateString('ru-RU')}</Text>}
        </View>
      )}

      {/* User header */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: user.isBanned ? '#EF444433' : '#6366F133', borderColor: user.isBanned ? '#EF4444' : '#6366F1' }]}>
          <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName?.[0] ?? ''}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
          {user.phone && <Text style={styles.meta}>{user.phone}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={[styles.roleBadge, { color: roleLower === 'admin' ? '#F59E0B' : '#9CA3AF' }]}>
              {roleLower.toUpperCase()}
            </Text>
            <Text style={styles.meta}>
              Зарегистрирован {new Date(user.createdAt).toLocaleDateString('ru-RU')}
            </Text>
          </View>
          {user.firstWorkoutAt && (
            <Text style={styles.meta}>
              1-я тренировка: {new Date(user.firstWorkoutAt).toLocaleDateString('ru-RU')}
            </Text>
          )}
          {user.workouts.length > 0 && user.workouts[0].completedAt && (
            <Text style={styles.meta}>
              Последняя: {new Date(user.workouts[0].completedAt).toLocaleDateString('ru-RU')}
            </Text>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: 'Тренировки', value: user._count.workouts },
          { label: 'Питание', value: user._count.meals },
          { label: 'ИИ', value: user._count.chatMessages },
          { label: 'Кардио', value: user._count.cardioSessions },
          { label: 'Тикеты', value: user._count.supportTickets },
        ].map((s) => (
          <View key={s.label} style={styles.statItem}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Engagement score */}
      <View style={[styles.engagementCard, { borderColor: engagementColor + '40' }]}>
        <View style={styles.engagementLeft}>
          <Text style={styles.engagementTitle}>Вовлечённость</Text>
          <Text style={[styles.engagementLabel, { color: engagementColor }]}>{engagementLabel}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.engagementBarTrack}>
            <View style={[styles.engagementBarFill, { width: `${engagementScore}%` as any, backgroundColor: engagementColor }]} />
          </View>
        </View>
        <Text style={[styles.engagementScore, { color: engagementColor }]}>{engagementScore}</Text>
      </View>

      {/* Subscription block */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Подписка</Text>

        {/* Current status */}
        <View style={styles.subStatus}>
          {PLANS.map((p) => {
            const isActive = currentPlan === p.key;
            return (
              <View
                key={p.key}
                style={[styles.planChip, isActive && { backgroundColor: p.color + '22', borderColor: p.color }]}
              >
                <Text style={[styles.planChipText, { color: isActive ? p.color : '#6B7280' }]} numberOfLines={1}>
                  {p.label}
                  {isActive && sub?.status ? ` · ${sub.status}` : ''}
                </Text>
              </View>
            );
          })}
        </View>

        {sub?.endDate ? (
          <View style={styles.subEndRow}>
            <Text style={[styles.subMeta, { flex: 1 }]}>
              До: {new Date(sub.endDate).toLocaleDateString('ru-RU')}
              {sub.status === 'active' && new Date(sub.endDate) > new Date() ? '' : '  ⚠️ истёк'}
            </Text>
            {isActiveSub && (
              <View style={styles.extendRow}>
                {[30, 90, 365].map((d) => (
                  <TouchableOpacity key={d} style={styles.extendBtn} onPress={() => extendSubscription(d)} disabled={busy}>
                    <Text style={styles.extendBtnText}>+{d}д</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : isActiveSub ? (
          <View style={styles.subEndRow}>
            <Text style={styles.subMeta}>Без даты окончания</Text>
            <View style={styles.extendRow}>
              {[30, 90, 365].map((d) => (
                <TouchableOpacity key={d} style={styles.extendBtn} onPress={() => extendSubscription(d)} disabled={busy}>
                  <Text style={styles.extendBtnText}>+{d}д</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {/* Grant buttons */}
        <Text style={styles.subSectionLabel}>Выдать подписку</Text>
        <View style={styles.subActions}>
          {PLANS.filter((p) => p.key !== 'free').map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.grantBtn, { borderColor: p.color }, currentPlan === p.key && { backgroundColor: p.color + '22' }]}
              onPress={() => grantPlan(p.key as Plan)}
              disabled={busy}
            >
              <Text style={[styles.grantBtnText, { color: p.color }]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revoke button — only shown when user has an active non-free plan */}
        {isActiveSub && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.revokeBtn}
              onPress={revokeSubscription}
              disabled={busy}
            >
              <Text style={styles.revokeBtnText}>Отозвать подписку</Text>
              <Text style={styles.revokeBtnSub}>Переведёт на Free · cancelled</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Role management */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Роль пользователя</Text>
        <View style={styles.chipsRow}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.chip, roleLower === r && styles.chipActive]}
              onPress={() => roleLower !== r && changeRole(r)}
              disabled={busy}
            >
              <Text style={[styles.chipText, roleLower === r && styles.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.cardHint}>Роль ADMIN даёт доступ к этой панели. Будьте осторожны.</Text>
      </View>

      {/* Fitness info */}
      {(user.weightKg || user.heightCm || user.goal) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Физ. данные</Text>
          {user.weightKg && <Row label="Вес" value={`${user.weightKg} кг`} />}
          {user.heightCm && <Row label="Рост" value={`${user.heightCm} см`} />}
          {user.goal && <Row label="Цель" value={user.goal} />}
          {user.fitnessLevel && <Row label="Уровень" value={user.fitnessLevel} />}
        </View>
      )}

      {/* Recent workouts */}
      {user.workouts?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Последние тренировки</Text>
          {user.workouts.map((w) => (
            <View key={w.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={1}>{w.name}</Text>
              <Text style={styles.listMeta}>
                {w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '—'}
                {w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}
                {w.durationMinutes ? ` · ${w.durationMinutes} мин` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent tickets */}
      {user.supportTickets?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Обращения в поддержку</Text>
          {user.supportTickets.map((t) => (
            <View key={t.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={1}>{t.subject}</Text>
              <Text style={styles.listMeta}>{t.status} · {new Date(t.createdAt).toLocaleDateString('ru-RU')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent AI messages */}
      {user.chatMessages?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Последние сообщения ИИ</Text>
          {user.chatMessages.map((m) => (
            <View key={m.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={2}>{m.content}</Text>
              <Text style={styles.listMeta}>{new Date(m.createdAt).toLocaleDateString('ru-RU')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Admin note */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={styles.cardTitle}>Заметка администратора</Text>
          {!editingNote ? (
            <TouchableOpacity onPress={() => setEditingNote(true)} style={styles.editNoteBtn}>
              <Text style={styles.editNoteBtnText}>{user.adminNote ? 'Редактировать' : 'Добавить'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => { setEditingNote(false); setNoteText(user.adminNote ?? ''); }}>
                <Text style={{ color: '#6B7280', fontSize: 12 }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveNote} disabled={busy}>
                <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '700' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {editingNote ? (
          <TextInput
            style={styles.noteInput}
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Внутренняя заметка для администраторов..."
            placeholderTextColor="#4B5563"
            multiline
            maxLength={1000}
          />
        ) : user.adminNote ? (
          <Text style={styles.noteText}>{user.adminNote}</Text>
        ) : (
          <Text style={styles.notePlaceholder}>Нет заметок</Text>
        )}
      </View>

      {/* Ban / Delete actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Опасные действия</Text>
        {user.isBanned ? (
          <TouchableOpacity style={styles.unbanBtn} onPress={unbanUser} disabled={busy}>
            <Text style={styles.unbanBtnText}>Разблокировать пользователя</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.revokeBtn} onPress={banUser} disabled={busy}>
            <Text style={styles.revokeBtnText}>Заблокировать пользователя</Text>
            <Text style={styles.revokeBtnSub}>Пользователь потеряет доступ к приложению</Text>
          </TouchableOpacity>
        )}
        <View style={styles.divider} />
        <TouchableOpacity style={styles.deleteBtn} onPress={deleteUserAccount} disabled={busy}>
          <Text style={styles.deleteBtnText}>Удалить аккаунт</Text>
          <Text style={styles.deleteBtnSub}>Анонимизирует данные · Необратимо</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },

  busyOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#00000060', zIndex: 99, justifyContent: 'center', alignItems: 'center',
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2,
  },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  email: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  meta: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  roleBadge: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#1C1C1E', borderRadius: 14,
    padding: 14, marginBottom: 16, justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#2C2C2E',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#6366F1' },
  statLabel: { fontSize: 9, color: '#6B7280', marginTop: 2, textAlign: 'center' },

  // Engagement score
  engagementCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1C1C1E', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1,
  },
  engagementLeft: { width: 80 },
  engagementTitle: { fontSize: 10, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  engagementLabel: { fontSize: 13, fontWeight: '700' },
  engagementBarTrack: { height: 8, backgroundColor: '#2C2C2E', borderRadius: 4, overflow: 'hidden' },
  engagementBarFill: { height: '100%', borderRadius: 4 },
  engagementScore: { fontSize: 22, fontWeight: '800', width: 36, textAlign: 'right' },

  card: {
    backgroundColor: '#1C1C1E', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2C2C2E',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  cardHint: { fontSize: 11, color: '#4B5563', marginTop: 10 },

  // Subscription
  subStatus: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  planChip: {
    borderRadius: 8, borderWidth: 1, borderColor: 'transparent',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  planChipText: { fontSize: 12, fontWeight: '600' },
  subMeta: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  subEndRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  extendRow: { flexDirection: 'row', gap: 4 },
  extendBtn: {
    borderRadius: 6, borderWidth: 1, borderColor: '#10B98160',
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#10B98110',
  },
  extendBtnText: { fontSize: 11, fontWeight: '700', color: '#10B981' },
  subSectionLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginTop: 12, marginBottom: 8 },
  subActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grantBtn: {
    borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8,
  },
  grantBtnText: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#2C2C2E', marginVertical: 12 },
  revokeBtn: {
    backgroundColor: '#EF444412', borderRadius: 10, borderWidth: 1,
    borderColor: '#EF4444', padding: 12, alignItems: 'center',
  },
  revokeBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  revokeBtnSub: { color: '#EF444480', fontSize: 11, marginTop: 2 },

  // Role chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#0F0F0F', borderWidth: 1, borderColor: '#2C2C2E',
  },
  chipActive: { backgroundColor: '#6366F122', borderColor: '#6366F1' },
  chipText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#6366F1' },

  // Info rows
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  infoLabel: { fontSize: 13, color: '#6B7280' },
  infoValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '500' },

  // List items
  listRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  listMain: { fontSize: 14, color: '#FFFFFF', marginBottom: 2 },
  listMeta: { fontSize: 12, color: '#6B7280' },

  // Ban banner
  banBanner: {
    backgroundColor: '#EF444412', borderRadius: 12, borderWidth: 1,
    borderColor: '#EF444450', padding: 14, marginBottom: 16,
  },
  banBannerTitle: { fontSize: 14, fontWeight: '800', color: '#EF4444', marginBottom: 4 },
  banBannerReason: { fontSize: 13, color: '#EF444490', fontStyle: 'italic' },
  banBannerDate: { fontSize: 11, color: '#EF444460', marginTop: 2 },

  // Admin note
  editNoteBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#2C2C2E', borderRadius: 6 },
  editNoteBtnText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  noteInput: {
    backgroundColor: '#0F0F0F', borderRadius: 8, padding: 12,
    fontSize: 14, color: '#FFFFFF', minHeight: 80, borderWidth: 1, borderColor: '#3C3C3E',
  },
  noteText: { fontSize: 14, color: '#D1D5DB', lineHeight: 20, fontStyle: 'italic' },
  notePlaceholder: { fontSize: 13, color: '#374151', fontStyle: 'italic' },

  // Unban button
  unbanBtn: {
    backgroundColor: '#10B98112', borderRadius: 10, borderWidth: 1,
    borderColor: '#10B981', padding: 12, alignItems: 'center',
  },
  unbanBtnText: { color: '#10B981', fontSize: 14, fontWeight: '700' },

  // Delete button
  deleteBtn: {
    backgroundColor: '#EF444408', borderRadius: 10, borderWidth: 1,
    borderColor: '#EF444450', padding: 12, alignItems: 'center',
  },
  deleteBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
  deleteBtnSub: { color: '#EF444060', fontSize: 11, marginTop: 2 },
});
