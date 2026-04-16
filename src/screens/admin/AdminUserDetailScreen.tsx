import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { adminService } from '../../services/adminService';
import type { AdminUserDetail, AdminLog, UserRole } from '../../types';

const RECENTLY_VIEWED_KEY = '@admin_recently_viewed_users';

async function addRecentlyViewed(user: { id: string; firstName: string; lastName?: string; email: string }) {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    const prev: typeof user[] = raw ? JSON.parse(raw) : [];
    const filtered = prev.filter((u) => u.id !== user.id);
    const updated = [user, ...filtered].slice(0, 6);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

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
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { userId } = route.params ?? {};

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [subHistory, setSubHistory] = useState<AdminLog[]>([]);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Array<{ id: string; createdAt: string; expiresAt: string; userAgent: string | null; ip: string | null }> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, logsData] = await Promise.all([
        adminService.getUser(userId),
        adminService.getLogs({ action: 'CHANGE_SUBSCRIPTION', limit: 20 }),
      ]);
      setUser(data);
      setNoteText(data.adminNote ?? '');
      setSubHistory(logsData.logs.filter((l) => l.targetId === userId));
      addRecentlyViewed({ id: data.id, firstName: data.firstName, lastName: data.lastName, email: data.email });
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

  const sendMessage = useCallback(async () => {
    if (!msgSubject.trim() || !msgBody.trim() || sendingMsg) return;
    setSendingMsg(true);
    try {
      await adminService.sendMessageToUser(userId, msgSubject.trim(), msgBody.trim());
      setShowMsgModal(false);
      setMsgSubject('');
      setMsgBody('');
      Alert.alert('Готово', 'Сообщение отправлено. Тикет создан в поддержке.');
    } catch {
      Alert.alert('Ошибка', 'Не удалось отправить сообщение');
    } finally {
      setSendingMsg(false);
    }
  }, [userId, msgSubject, msgBody, sendingMsg]);

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
    <>
    {/* Send message modal */}
    <Modal visible={showMsgModal} transparent animationType="slide" onRequestClose={() => setShowMsgModal(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.msgOverlay}>
          <View style={styles.msgSheet}>
            <View style={styles.msgHeader}>
              <Text style={styles.msgTitle}>Написать пользователю</Text>
              <TouchableOpacity onPress={() => setShowMsgModal(false)}>
                <Text style={{ color: '#6B7280', fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.msgHint}>Создаётся тикет в поддержке, видимый пользователю</Text>
            <TextInput
              style={styles.msgSubjectInput}
              placeholder="Тема сообщения..."
              placeholderTextColor="#6B7280"
              value={msgSubject}
              onChangeText={setMsgSubject}
              maxLength={200}
            />
            <TextInput
              style={styles.msgBodyInput}
              placeholder="Текст сообщения..."
              placeholderTextColor="#6B7280"
              value={msgBody}
              onChangeText={setMsgBody}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.msgSendBtn, (!msgSubject.trim() || !msgBody.trim() || sendingMsg) && { opacity: 0.5 }]}
              onPress={sendMessage}
              disabled={!msgSubject.trim() || !msgBody.trim() || sendingMsg}
            >
              {sendingMsg
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text style={styles.msgSendBtnText}>Отправить</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

      {/* Lockout banner */}
      {!user.isBanned && user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
        <View style={[styles.banBanner, { backgroundColor: '#F59E0B12', borderColor: '#F59E0B50' }]}>
          <Text style={[styles.banBannerTitle, { color: '#F59E0B' }]}>🔒 Временная блокировка</Text>
          <Text style={[styles.banBannerReason, { color: '#F59E0BAA' }]}>
            Слишком много неверных паролей. До: {new Date(user.lockedUntil!).toLocaleString('ru-RU')}
          </Text>
          <TouchableOpacity
            onPress={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await adminService.unlockUser(userId);
                setUser({ ...user, lockedUntil: null, loginAttempts: 0 });
              } catch { Alert.alert('Ошибка', 'Не удалось снять блокировку'); }
              finally { setBusy(false); }
            }}
            style={{ marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F59E0B22', borderWidth: 1, borderColor: '#F59E0B' }}
          >
            <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '700' }}>Снять блокировку</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Contextual alerts */}
      {!user.isBanned && (() => {
        const alerts: Array<{ icon: string; text: string; color: string; action?: { label: string; onPress: () => void } }> = [];
        const sub = user.subscription;
        const lastWorkout = user.workouts?.[0]?.completedAt;
        const daysSince = lastWorkout ? Math.floor((Date.now() - new Date(lastWorkout).getTime()) / 86400000) : null;
        const isPaid = sub?.status === 'active' && sub.plan !== 'free';
        const daysLeft = sub?.endDate ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000) : null;

        if (isPaid && daysSince !== null && daysSince >= 14) {
          alerts.push({ icon: '⚡', color: '#EF4444', text: `Чурн-риск: нет тренировок ${daysSince} дней при активной подписке`, action: { label: '💬 Написать', onPress: () => setShowMsgModal(true) } });
        }
        if (daysLeft !== null && daysLeft <= 7 && daysLeft > 0) {
          alerts.push({ icon: '⏰', color: '#F59E0B', text: `Подписка ${sub!.plan.toUpperCase()} истекает через ${daysLeft} дн.` });
        }
        if (!user.goal && user._count.workouts === 0) {
          alerts.push({ icon: '🆕', color: '#6366F1', text: 'Новый пользователь: цель не задана, тренировок нет' });
        }
        if (user._count.supportTickets > 5 && user.supportTickets?.some((t) => t.status === 'open')) {
          alerts.push({ icon: '🎫', color: '#8B5CF6', text: `${user._count.supportTickets} тикетов, есть открытые` });
        }
        if (alerts.length === 0) return null;
        return (
          <View style={{ marginBottom: 12, gap: 6 }}>
            {alerts.map((a, i) => (
              <View key={i} style={[styles.alertRow, { borderColor: a.color + '40', backgroundColor: a.color + '10' }]}>
                <Text style={{ fontSize: 14 }}>{a.icon}</Text>
                <Text style={[styles.alertText, { color: a.color }]} numberOfLines={2}>{a.text}</Text>
                {a.action && (
                  <TouchableOpacity onPress={a.action.onPress} style={[styles.alertActionBtn, { borderColor: a.color }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: a.color }}>{a.action.label}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        );
      })()}

      {/* User header */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: user.isBanned ? '#EF444433' : '#6366F133', borderColor: user.isBanned ? '#EF4444' : '#6366F1' }]}>
          <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName?.[0] ?? ''}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
          {user.phone && (
            <Text style={styles.meta}>
              {user.phone}
              {user.phoneVerified ? ' ✓' : ' (не подтверждён)'}
            </Text>
          )}
          {/* Email verification badge + quick action */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={{ fontSize: 11, color: user.emailVerified ? '#34C759' : '#F59E0B', fontWeight: '600' }}>
              {user.emailVerified ? '✓ Email подтверждён' : '⚠ Email не подтверждён'}
            </Text>
            {!user.emailVerified && (
              <TouchableOpacity
                onPress={async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    await adminService.forceVerifyEmail(userId);
                    setUser({ ...user, emailVerified: true });
                  } catch { Alert.alert('Ошибка', 'Не удалось верифицировать email'); }
                  finally { setBusy(false); }
                }}
                style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: '#34C75920', borderWidth: 1, borderColor: '#34C75960' }}
              >
                <Text style={{ fontSize: 10, color: '#34C759', fontWeight: '700' }}>Верифицировать</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Linked accounts */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {user.googleId && <Text style={{ fontSize: 10, color: '#4285F4', fontWeight: '700', backgroundColor: '#4285F415', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>G</Text>}
            {user.vkId && <Text style={{ fontSize: 10, color: '#0077FF', fontWeight: '700', backgroundColor: '#0077FF15', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>ВК</Text>}
          </View>
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

      {/* Subscription history */}
      {subHistory.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>История подписки</Text>
          {subHistory.map((log) => (
            <View key={log.id} style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDetails} numberOfLines={2}>{log.details ?? '—'}</Text>
                <Text style={styles.historyAdmin}>
                  {log.admin.firstName} {log.admin.lastName ?? ''} · {log.admin.email}
                </Text>
              </View>
              <Text style={styles.historyDate}>
                {new Date(log.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      )}

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

      {/* Activity timeline */}
      {(user.workouts?.length > 0 || user.supportTickets?.length > 0 || user.chatMessages?.length > 0) && (() => {
        const events: Array<{ date: string; type: 'workout' | 'ticket' | 'ai'; label: string; sub?: string; id?: string }> = [];
        user.workouts?.forEach((w) => w.completedAt && events.push({
          date: w.completedAt, type: 'workout', label: w.name,
          sub: [w.totalVolume ? `${Math.round(w.totalVolume)} кг` : '', w.durationMinutes ? `${w.durationMinutes} мин` : ''].filter(Boolean).join(' · '),
        }));
        user.supportTickets?.forEach((t) => events.push({ date: t.createdAt, type: 'ticket', label: t.subject, sub: t.status, id: t.id }));
        user.chatMessages?.forEach((m) => events.push({ date: m.createdAt, type: 'ai', label: m.content }));
        events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const TYPE_ICON = { workout: '🏋️', ticket: '🎧', ai: '🤖' };
        const TYPE_COLOR = { workout: '#F59E0B', ticket: '#6366F1', ai: '#8B5CF6' };
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Последняя активность</Text>
            {events.slice(0, 10).map((e, i) => (
              <TouchableOpacity
                key={i}
                style={styles.timelineRow}
                onPress={e.type === 'ticket' && e.id ? () => navigation.navigate('AdminTicketScreen', { ticketId: e.id }) : undefined}
                disabled={e.type !== 'ticket'}
                activeOpacity={e.type === 'ticket' ? 0.7 : 1}
              >
                <View style={[styles.timelineDot, { backgroundColor: TYPE_COLOR[e.type] + '33', borderColor: TYPE_COLOR[e.type] }]}>
                  <Text style={{ fontSize: 10 }}>{TYPE_ICON[e.type]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.timelineLabel, e.type === 'ticket' && { color: '#A5B4FC' }]} numberOfLines={1}>{e.label}</Text>
                  {e.sub && <Text style={styles.timelineSub}>{e.sub}</Text>}
                </View>
                <Text style={styles.timelineDate}>
                  {new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}

      {/* Workout frequency chart — 12-week heatmap */}
      {user.workoutDates90d && user.workoutDates90d.length > 0 && (() => {
        const today = new Date();
        // Build 12-week grid (Mon→Sun), oldest week first
        const weeks: Array<{ label: string; days: Array<{ date: string; count: number }> }> = [];
        // Start from 12 weeks ago on Monday
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 83); // ~12 weeks back
        // Align to Monday
        const dow = (startDate.getDay() + 6) % 7; // 0=Mon
        startDate.setDate(startDate.getDate() - dow);

        const countMap: Record<string, number> = {};
        user.workoutDates90d!.forEach((d) => { countMap[d] = (countMap[d] ?? 0) + 1; });

        for (let w = 0; w < 12; w++) {
          const weekStart = new Date(startDate);
          weekStart.setDate(weekStart.getDate() + w * 7);
          const days = [];
          for (let d = 0; d < 7; d++) {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + d);
            const key = day.toISOString().split('T')[0];
            days.push({ date: key, count: countMap[key] ?? 0 });
          }
          const monthLabel = weekStart.toLocaleDateString('ru-RU', { month: 'short' });
          weeks.push({ label: monthLabel, days });
        }

        const totalWorkouts = user.workoutDates90d!.length;
        const activeWeeks = weeks.filter((w) => w.days.some((d) => d.count > 0)).length;

        return (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.cardTitle}>Частота тренировок (90 дней)</Text>
              <Text style={{ fontSize: 11, color: '#6B7280' }}>{totalWorkouts} тр · {activeWeeks}/12 нед</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {weeks.map((week, wi) => (
                <View key={wi} style={{ flex: 1, gap: 2 }}>
                  {week.days.map((day, di) => {
                    const isFuture = day.date > today.toISOString().split('T')[0];
                    const bg = isFuture ? 'transparent' : day.count > 1 ? '#6366F1' : day.count === 1 ? '#6366F170' : '#1C1C1E';
                    return (
                      <View
                        key={di}
                        style={{
                          aspectRatio: 1, borderRadius: 2,
                          backgroundColor: bg,
                          borderWidth: isFuture ? 0 : 0,
                        }}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: '#2C2C2E' }} />
              <Text style={{ fontSize: 10, color: '#6B7280' }}>0</Text>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#6366F170' }} />
              <Text style={{ fontSize: 10, color: '#6B7280' }}>1</Text>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#6366F1' }} />
              <Text style={{ fontSize: 10, color: '#6B7280' }}>2+</Text>
            </View>
          </View>
        );
      })()}

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

      {/* Body weight trend */}
      {user.bodyWeights && user.bodyWeights.length >= 2 && (() => {
        const sorted = [...user.bodyWeights].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const weights = sorted.map((w) => w.weightKg);
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        const range = max - min || 1;
        const first = weights[0];
        const last = weights[weights.length - 1];
        const delta = last - first;
        const CHART_H = 44;
        return (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.cardTitle}>Динамика веса</Text>
              <Text style={[styles.listMeta, { color: delta < 0 ? '#10B981' : delta > 0 ? '#F59E0B' : '#6B7280', fontWeight: '700' }]}>
                {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} кг
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, gap: 3 }}>
              {weights.map((w, i) => {
                const h = Math.max(4, Math.round(((w - min) / range) * CHART_H));
                const isLast = i === weights.length - 1;
                return (
                  <View
                    key={i}
                    style={{
                      flex: 1, height: h, borderRadius: 3,
                      backgroundColor: isLast ? '#6366F1' : '#6366F150',
                    }}
                  />
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={styles.listMeta}>{new Date(sorted[0].date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — {first.toFixed(1)} кг</Text>
              <Text style={styles.listMeta}>{new Date(sorted[sorted.length - 1].date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — {last.toFixed(1)} кг</Text>
            </View>
          </View>
        );
      })()}

      {/* Sleep stats */}
      {user.sleepEntries && user.sleepEntries.length >= 3 && (() => {
        const entries = user.sleepEntries!;
        const avgDuration = entries.reduce((s, e) => s + e.durationHours, 0) / entries.length;
        const qualityEntries = entries.filter((e) => e.quality != null);
        const avgQuality = qualityEntries.length > 0
          ? qualityEntries.reduce((s, e) => s + (e.quality ?? 0), 0) / qualityEntries.length
          : null;
        const sleepColor = avgDuration >= 7.5 ? '#10B981' : avgDuration >= 6 ? '#F59E0B' : '#EF4444';
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Сон (последние {entries.length} записей)</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
              <View>
                <Text style={[styles.statValue, { fontSize: 20, color: sleepColor }]}>
                  {avgDuration.toFixed(1)}ч
                </Text>
                <Text style={styles.statLabel}>ср. продолж.</Text>
              </View>
              {avgQuality !== null && (
                <View>
                  <Text style={[styles.statValue, { fontSize: 20, color: avgQuality >= 4 ? '#10B981' : avgQuality >= 3 ? '#F59E0B' : '#EF4444' }]}>
                    {avgQuality.toFixed(1)}/5
                  </Text>
                  <Text style={styles.statLabel}>ср. качество</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 32, gap: 2 }}>
              {[...entries].reverse().map((e, i) => {
                const h = Math.max(3, Math.round((e.durationHours / 12) * 32));
                return (
                  <View
                    key={e.id}
                    style={{
                      flex: 1, height: h, borderRadius: 2,
                      backgroundColor: i === entries.length - 1 ? '#6366F1' : '#6366F150',
                    }}
                  />
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* Workout heatmap (last 90 days) */}
      {user.workoutDates90d && user.workoutDates90d.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Активность (90 дней)</Text>
          {(() => {
            const dateSet = new Set(user.workoutDates90d);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            // Show last 13 weeks (91 days) in a 7-row × 13-col grid
            const COLS = 13; const ROWS = 7;
            const cells: { date: string; active: boolean }[] = [];
            // Pad start to align to Monday
            const startDay = new Date(today); startDay.setDate(startDay.getDate() - (COLS * ROWS - 1));
            for (let i = 0; i < COLS * ROWS; i++) {
              const d = new Date(startDay); d.setDate(startDay.getDate() + i);
              const key = d.toISOString().split('T')[0];
              cells.push({ date: key, active: dateSet.has(key) });
            }
            return (
              <View style={styles.heatmapGrid}>
                {Array.from({ length: COLS }).map((_, col) => (
                  <View key={col} style={styles.heatmapCol}>
                    {Array.from({ length: ROWS }).map((_, row) => {
                      const cell = cells[col * ROWS + row];
                      const isToday = cell.date === today.toISOString().split('T')[0];
                      return (
                        <View
                          key={row}
                          style={[
                            styles.heatmapCell,
                            cell.active && styles.heatmapCellActive,
                            isToday && styles.heatmapCellToday,
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })()}
          <Text style={styles.heatmapLegend}>
            {user.workoutDates90d.length} тренировок за последние 90 дней
          </Text>
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
            <TouchableOpacity
              key={t.id}
              style={[styles.listRow, { borderRadius: 6 }]}
              onPress={() => navigation.navigate('AdminTicketScreen', { ticketId: t.id })}
              activeOpacity={0.7}
            >
              <Text style={[styles.listMain, { color: '#A5B4FC' }]} numberOfLines={1}>{t.subject}</Text>
              <Text style={styles.listMeta}>{t.status} · {new Date(t.createdAt).toLocaleDateString('ru-RU')} →</Text>
            </TouchableOpacity>
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

      {/* Recent cardio sessions */}
      {user.cardioSessions && user.cardioSessions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Последние кардио-сессии</Text>
          {user.cardioSessions.map((s) => (
            <View key={s.id} style={styles.listRow}>
              <Text style={styles.listMain} numberOfLines={1}>
                {s.type.charAt(0).toUpperCase() + s.type.slice(1)} — {s.durationMinutes} мин
                {s.distanceKm ? ` · ${s.distanceKm.toFixed(1)} км` : ''}
                {s.caloriesBurned ? ` · ${s.caloriesBurned} ккал` : ''}
              </Text>
              <Text style={styles.listMeta}>{new Date(s.createdAt).toLocaleDateString('ru-RU')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Activity Timeline */}
      {(() => {
        type TimelineEvent = { date: string; icon: string; label: string; color: string; id: string };
        const events: TimelineEvent[] = [];
        user.workouts?.forEach((w) => {
          if (w.completedAt) events.push({
            date: w.completedAt,
            icon: '💪',
            label: `Тренировка: ${w.name}${w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}${w.durationMinutes ? ` · ${w.durationMinutes} мин` : ''}`,
            color: '#F59E0B',
            id: 'w_' + w.id,
          });
        });
        user.cardioSessions?.forEach((s) => events.push({
          date: s.createdAt,
          icon: '🏃',
          label: `Кардио: ${s.type} · ${s.durationMinutes} мин${s.distanceKm ? ` · ${s.distanceKm.toFixed(1)} км` : ''}`,
          color: '#10B981',
          id: 'c_' + s.id,
        }));
        user.chatMessages?.slice(0, 5).forEach((m) => events.push({
          date: m.createdAt,
          icon: '🤖',
          label: `ИИ: ${m.content.slice(0, 60)}${m.content.length > 60 ? '…' : ''}`,
          color: '#8B5CF6',
          id: 'm_' + m.id,
        }));
        user.bodyWeights?.slice(0, 5).forEach((bw) => events.push({
          date: bw.date,
          icon: '⚖️',
          label: `Вес: ${bw.weightKg} кг`,
          color: '#6366F1',
          id: 'bw_' + bw.id,
        }));
        user.supportTickets?.forEach((t) => events.push({
          date: t.createdAt,
          icon: '🎫',
          label: `Тикет: ${t.subject} · ${t.status}`,
          color: '#6B7280',
          id: 't_' + t.id,
        }));
        events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const top = events.slice(0, 12);
        if (top.length === 0) return null;
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Лента активности (последние события)</Text>
            {top.map((ev, i) => (
              <View key={ev.id} style={styles.evtRow}>
                <View style={[styles.evtDot, { backgroundColor: ev.color + '30', borderColor: ev.color }]}>
                  <Text style={{ fontSize: 11 }}>{ev.icon}</Text>
                </View>
                {i < top.length - 1 && <View style={styles.evtLine} />}
                <View style={styles.evtContent}>
                  <Text style={styles.evtLabel} numberOfLines={2}>{ev.label}</Text>
                  <Text style={styles.evtDate}>
                    {new Date(ev.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })()}

      {/* AI Memories */}
      {user.aiMemories && user.aiMemories.length > 0 && (() => {
        const CATEGORY_LABEL: Record<string, string> = {
          preference: 'Предпочтения',
          habit: 'Привычки',
          injury: 'Травмы',
          allergy: 'Аллергии',
          schedule: 'Расписание',
          personality: 'Личность',
        };
        const CATEGORY_COLOR: Record<string, string> = {
          preference: '#6366F1',
          habit: '#10B981',
          injury: '#EF4444',
          allergy: '#F59E0B',
          schedule: '#3B82F6',
          personality: '#EC4899',
        };
        const grouped: Record<string, typeof user.aiMemories> = {};
        for (const m of user.aiMemories!) {
          if (!grouped[m.category]) grouped[m.category] = [];
          grouped[m.category]!.push(m);
        }
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Память ИИ ({user.aiMemories.length})</Text>
            {Object.entries(grouped).map(([cat, mems]) => (
              <View key={cat} style={styles.memGroup}>
                <View style={[styles.memCatBadge, { backgroundColor: (CATEGORY_COLOR[cat] ?? '#6B7280') + '25', borderColor: CATEGORY_COLOR[cat] ?? '#6B7280' }]}>
                  <Text style={[styles.memCatText, { color: CATEGORY_COLOR[cat] ?? '#9CA3AF' }]}>
                    {CATEGORY_LABEL[cat] ?? cat}
                  </Text>
                </View>
                {mems!.map((m) => (
                  <View key={m.id} style={styles.memRow}>
                    <View style={styles.memLeft}>
                      <Text style={styles.memKey}>{m.key}</Text>
                      <Text style={styles.memValue} numberOfLines={2}>{m.value}</Text>
                    </View>
                    <View style={styles.memRight}>
                      <Text style={[styles.memConf, { color: m.confidence > 0.7 ? '#10B981' : m.confidence > 0.4 ? '#F59E0B' : '#EF4444' }]}>
                        {Math.round(m.confidence * 100)}%
                      </Text>
                      <Text style={styles.memSource}>{m.source}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      })()}

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

      {/* Security events quick-link */}
      <TouchableOpacity
        style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => navigation.navigate('AdminSecurityEventsScreen', { userId })}
      >
        <View>
          <Text style={[styles.cardTitle, { marginBottom: 2 }]}>События безопасности</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Входы, смены пароля, OTP-атаки</Text>
        </View>
        <Text style={{ color: '#9CA3AF', fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      {/* Message user */}
      <TouchableOpacity style={styles.msgUserBtn} onPress={() => setShowMsgModal(true)}>
        <Text style={styles.msgUserBtnText}>💬 Написать пользователю</Text>
        <Text style={styles.msgUserBtnSub}>Создаст тикет в поддержке</Text>
      </TouchableOpacity>

      {/* Active sessions */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.cardTitle}>Активные сессии</Text>
          <TouchableOpacity onPress={async () => {
            try {
              const sessions = await adminService.getUserSessions(userId);
              setActiveSessions(sessions);
            } catch {
              Alert.alert('Ошибка', 'Не удалось загрузить сессии');
            }
          }}>
            <Text style={{ fontSize: 12, color: '#8B5CF6' }}>Загрузить</Text>
          </TouchableOpacity>
        </View>
        {activeSessions === null ? (
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Нажмите «Загрузить» для просмотра</Text>
        ) : activeSessions.length === 0 ? (
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Нет активных сессий</Text>
        ) : (
          activeSessions.map((s) => (
            <View key={s.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
                {s.userAgent ? (s.userAgent.includes('iPhone') ? 'iPhone' : s.userAgent.includes('Android') ? 'Android' : s.userAgent.slice(0, 30)) : 'Неизвестное устройство'}
              </Text>
              <Text style={{ fontSize: 11, color: '#6B7280' }}>
                IP: {s.ip ?? '—'} · Вход: {new Date(s.createdAt).toLocaleDateString('ru-RU')}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Force logout */}
      <TouchableOpacity
        style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
        onPress={() => {
          Alert.alert(
            'Принудительный выход',
            'Все активные сессии пользователя будут завершены. Он будет автоматически разлогинен.',
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Выйти со всех устройств',
                style: 'destructive',
                onPress: async () => {
                  if (busy) return;
                  setBusy(true);
                  try {
                    const result = await adminService.forceLogoutUser(userId);
                    Alert.alert('Готово', `Завершено ${result.revokedCount} сессий`);
                    setActiveSessions([]);
                  } catch {
                    Alert.alert('Ошибка', 'Не удалось завершить сессии');
                  } finally {
                    setBusy(false);
                  }
                },
              },
            ],
          );
        }}
      >
        <View>
          <Text style={[styles.cardTitle, { marginBottom: 2, color: '#EF4444' }]}>Выйти со всех устройств</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Отзывает все refresh-токены пользователя</Text>
        </View>
        <Text style={{ color: '#EF4444', fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      {/* Force disable 2FA */}
      {user.totpEnabled && (
        <TouchableOpacity
          style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          onPress={() => {
            Alert.alert(
              'Отключить 2FA',
              'Двухфакторная аутентификация пользователя будет отключена. Использовать только для восстановления доступа.',
              [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Отключить 2FA',
                  style: 'destructive',
                  onPress: async () => {
                    if (busy) return;
                    setBusy(true);
                    try {
                      await adminService.forceDisable2FA(userId);
                      Alert.alert('Готово', 'Двухфакторная аутентификация отключена');
                      setUser((u) => u ? { ...u, totpEnabled: false } : u);
                    } catch {
                      Alert.alert('Ошибка', 'Не удалось отключить 2FA');
                    } finally {
                      setBusy(false);
                    }
                  },
                },
              ],
            );
          }}
        >
          <View>
            <Text style={[styles.cardTitle, { marginBottom: 2, color: '#FF9F0A' }]}>Отключить 2FA</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Для восстановления доступа пользователя</Text>
          </View>
          <Text style={{ color: '#FF9F0A', fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      )}

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
    </>
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

  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2C2C2E' },
  timelineDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  timelineLabel: { fontSize: 13, color: '#FFFFFF' },
  timelineSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  timelineDate: { fontSize: 11, color: '#4B5563', flexShrink: 0 },

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

  historyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2C2C2E', gap: 8 },
  historyDetails: { fontSize: 13, color: '#D1D5DB', marginBottom: 2 },
  historyAdmin: { fontSize: 11, color: '#6B7280' },
  historyDate: { fontSize: 11, color: '#4B5563', marginTop: 2 },

  heatmapGrid: { flexDirection: 'row', gap: 3, marginBottom: 8 },
  heatmapCol: { flexDirection: 'column', gap: 3 },
  heatmapCell: { width: 14, height: 14, borderRadius: 3, backgroundColor: '#2C2C2E' },
  heatmapCellActive: { backgroundColor: '#6366F1' },
  heatmapCellToday: { borderWidth: 1, borderColor: '#A5B4FC' },
  heatmapLegend: { fontSize: 11, color: '#6B7280', marginTop: 4 },

  // Contextual alerts
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  alertText: { fontSize: 12, fontWeight: '600', flex: 1 },
  alertActionBtn: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },

  // Activity Timeline (event feed)
  evtRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  evtDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  evtLine: {
    position: 'absolute', left: 13, top: 28, width: 2, height: 14, backgroundColor: '#2C2C2E',
  },
  evtContent: { flex: 1, paddingTop: 2 },
  evtLabel: { fontSize: 12, color: '#D1D5DB', lineHeight: 16 },
  evtDate: { fontSize: 10, color: '#6B7280', marginTop: 2 },

  // AI Memories
  memGroup: { marginBottom: 12 },
  memCatBadge: {
    alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
  },
  memCatText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  memRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1C1C1E',
  },
  memLeft: { flex: 1, paddingRight: 8 },
  memKey: { fontSize: 12, fontWeight: '600', color: '#D1D5DB', marginBottom: 2 },
  memValue: { fontSize: 12, color: '#6B7280' },
  memRight: { alignItems: 'flex-end' },
  memConf: { fontSize: 13, fontWeight: '700' },
  memSource: { fontSize: 10, color: '#4B5563', marginTop: 1, textTransform: 'capitalize' },

  // Message user
  msgUserBtn: {
    backgroundColor: '#6366F112', borderRadius: 12, borderWidth: 1,
    borderColor: '#6366F140', padding: 14, marginBottom: 12,
  },
  msgUserBtnText: { fontSize: 14, fontWeight: '700', color: '#6366F1' },
  msgUserBtnSub: { fontSize: 11, color: '#6366F170', marginTop: 2 },

  // Message modal
  msgOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  msgSheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32 },
  msgHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  msgTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  msgHint: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  msgSubjectInput: {
    backgroundColor: '#2C2C2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#FFFFFF', marginBottom: 10, borderWidth: 1, borderColor: '#3C3C3E',
  },
  msgBodyInput: {
    backgroundColor: '#2C2C2E', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: '#FFFFFF', height: 120, marginBottom: 16, borderWidth: 1, borderColor: '#3C3C3E',
  },
  msgSendBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  msgSendBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
