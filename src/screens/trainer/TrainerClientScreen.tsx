import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, ActivityIndicator, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useTrainerStore } from '../../store';
import { TrainerClient } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ProgramPickerModal, EditClientModal, ClientNotesCard } from './components';
import { localDateStr } from '../../utils/date';

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение', muscle_gain: 'Набор массы', strength: 'Сила',
  endurance: 'Выносливость', general_fitness: 'Общая форма',
};
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
};

export const TrainerClientScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { updateClient, logWorkoutSession, removeWorkoutSession, getClientSessions, fetchSessions } = useTrainerStore();
  const [client, setClient] = useState<TrainerClient>(route.params?.client);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogSession, setShowLogSession] = useState(false);
  const [savingSession, setSavingSession] = useState(false);

  // Log session form state
  const [sessionName, setSessionName] = useState('');
  const [sessionDuration, setSessionDuration] = useState('');
  const [sessionVolume, setSessionVolume] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  // Sync sessions from server on mount
  useEffect(() => {
    if (client?.id) fetchSessions(client.id).catch(() => {});
  }, [client?.id]);

  if (!client) { navigation.goBack(); return null; }

  const today = localDateStr(new Date());
  const trainedToday = client.lastVisit === today;

  const sessions = getClientSessions(client.id);

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const avgDuration = Math.round(sessions.reduce((s, w) => s + w.durationMinutes, 0) / sessions.length);
    const sessionsWithVolume = sessions.filter((w) => w.volumeKg);
    const avgVolume = sessionsWithVolume.length > 0
      ? sessionsWithVolume.reduce((s, w) => s + (w.volumeKg || 0), 0) / sessionsWithVolume.length
      : null;
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = localDateStr(weekAgo);
    const weekCount = sessions.filter((w) => w.date >= weekAgoStr).length;
    return { avgDuration, avgVolume, weekCount };
  }, [sessions]);

  const handleAssignProgram = (program: string) => {
    const updated = { ...client, assignedProgram: program };
    setClient(updated);
    updateClient(client.id, { assignedProgram: program });
    setShowProgramPicker(false);
  };

  const handleClearProgram = () => {
    setClient((prev) => ({ ...prev, assignedProgram: undefined }));
    updateClient(client.id, { assignedProgram: undefined });
    setShowProgramPicker(false);
  };

  const handleSaveProfile = (patch: Partial<TrainerClient>) => {
    setClient((prev) => ({ ...prev, ...patch }));
    updateClient(client.id, patch);
    setShowEditProfile(false);
  };

  const handleMarkTrainingDone = () => {
    if (trainedToday) return;
    haptic.success();
    const patch: Partial<TrainerClient> = { lastVisit: today, totalWorkouts: (client.totalWorkouts || 0) + 1 };
    setClient((prev) => ({ ...prev, ...patch }));
    updateClient(client.id, patch);
  };

  const handleLogSession = async () => {
    if (savingSession || !sessionName.trim() || !sessionDuration.trim()) return;
    haptic.success();
    setSavingSession(true);
    try {
      await logWorkoutSession({
        clientId: client.id,
        date: today,
        name: sessionName.trim(),
        durationMinutes: parseInt(sessionDuration.replace(',', '.'), 10) || 60,
        volumeKg: sessionVolume ? parseFloat(sessionVolume.replace(',', '.')) * 1000 : undefined,
        notes: sessionNotes.trim() || undefined,
      });
      // Update local client state to reflect new totalWorkouts / lastVisit
      const patch: Partial<TrainerClient> = { lastVisit: today, totalWorkouts: (client.totalWorkouts || 0) + 1 };
      setClient((prev) => ({ ...prev, ...patch }));
      // Reset form
      setSessionName('');
      setSessionDuration('');
      setSessionVolume('');
      setSessionNotes('');
      setShowLogSession(false);
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить тренировку. Попробуйте ещё раз.');
    } finally {
      setSavingSession(false);
    }
  };

  const goal = client.goal ? GOAL_LABELS[client.goal] ?? client.goal : null;
  const level = client.level ? LEVEL_LABELS[client.level] ?? client.level : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text, flex: 1, textAlign: 'center' }]} numberOfLines={1}>{client.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20', borderWidth: 1.5, borderColor: colors.primary + '40' }]}>
              <Text style={{ fontSize: 32, fontWeight: '700', color: colors.primary }}>{client.emoji || '◉'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.h4, { color: colors.text }]}>{client.name}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: 4, flexWrap: 'wrap' }}>
                {client.age && <Text style={[typography.caption, { color: colors.textSecondary }]}>{client.age} лет</Text>}
                {client.phone && <Text style={[typography.caption, { color: colors.textSecondary }]}>{client.phone}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => { haptic.selection(); setShowEditProfile(true); }} style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>✎ Изменить</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagsRow}>
            {goal && <View style={[styles.tag, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '35' }]}><Text style={[typography.caption, { color: colors.primary }]}>{goal}</Text></View>}
            {level && <View style={[styles.tag, { backgroundColor: colors.accent + '15', borderWidth: 1, borderColor: colors.accent + '35' }]}><Text style={[typography.caption, { color: colors.accent }]}>{level}</Text></View>}
            {client.totalWorkouts !== undefined && <View style={[styles.tag, { backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '35' }]}><Text style={[typography.caption, { color: colors.success }]}>{client.totalWorkouts} тренировок</Text></View>}
          </View>
        </Card>

        {/* Action buttons row */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <TouchableOpacity onPress={handleMarkTrainingDone} disabled={trainedToday} activeOpacity={0.8} style={{ flex: 1 }}>
            <View style={[styles.markDoneBtn, { backgroundColor: trainedToday ? colors.success + '20' : colors.success, borderColor: colors.success }]}>
              <Text style={{ fontWeight: '700', color: trainedToday ? colors.success : '#fff' }}>{trainedToday ? '✓' : '◎'}</Text>
              <Text style={[typography.small, { color: trainedToday ? colors.success : '#fff', marginLeft: spacing.sm }]} numberOfLines={1}>
                {trainedToday ? 'Отмечено' : 'Отметить'}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic.selection(); setShowLogSession(true); }} activeOpacity={0.8} style={{ flex: 2 }}>
            <View style={[styles.markDoneBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={{ fontWeight: '700', color: '#fff' }}>+</Text>
              <Text style={[typography.small, { color: '#fff', marginLeft: spacing.sm }]} numberOfLines={1}>Записать тренировку</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Assigned Program */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>ПРОГРАММА ТРЕНИРОВОК</Text>
            <TouchableOpacity onPress={() => { haptic.selection(); setShowProgramPicker(true); }} style={[styles.editBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
              <Text style={[typography.caption, { color: colors.primary }]}>Изменить</Text>
            </TouchableOpacity>
          </View>
          {client.assignedProgram
            ? <Text style={[typography.bodySemibold, { color: colors.text }]}>{client.assignedProgram}</Text>
            : <Text style={[typography.body, { color: colors.textTertiary }]}>Программа не назначена</Text>}
        </Card>

        <ClientNotesCard clientId={client.id} initialNotes={client.notes || ''} />

        {/* Quick stats */}
        {stats && (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[typography.number, { color: colors.primary, fontSize: 22 }]}>{stats.avgDuration}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. мин</Text>
            </Card>
            {stats.avgVolume !== null && (
              <Card style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[typography.number, { color: colors.success, fontSize: 22 }]}>{(stats.avgVolume / 1000).toFixed(1)}т</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. объём</Text>
              </Card>
            )}
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[typography.number, { color: colors.accent, fontSize: 22 }]}>{stats.weekCount}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>трен/нед</Text>
            </Card>
          </View>
        )}

        {/* Recent workouts */}
        <Card style={{ marginBottom: spacing.huge }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ПОСЛЕДНИЕ ТРЕНИРОВКИ</Text>
          {sessions.length === 0 ? (
            <Text style={[typography.body, { color: colors.textTertiary }]}>Тренировки не записаны</Text>
          ) : (
            sessions.slice(0, 15).map((w, i, arr) => (
              <View key={w.id} style={[styles.workoutRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{w.name}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                    {new Date(w.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    {'  •  '}{w.durationMinutes} мин
                    {w.notes ? `  •  ${w.notes}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {w.volumeKg ? (
                    <Text style={[typography.captionMedium, { color: colors.primary }]}>{(w.volumeKg / 1000).toFixed(1)} т</Text>
                  ) : null}
                  <TouchableOpacity onPress={() => { haptic.warning(); removeWorkoutSession(w.id).catch(() => {}); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[typography.caption, { color: colors.error + '80' }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      <ProgramPickerModal
        visible={showProgramPicker}
        currentProgram={client.assignedProgram}
        onClose={() => setShowProgramPicker(false)}
        onSelect={handleAssignProgram}
        onClear={handleClearProgram}
      />
      <EditClientModal
        visible={showEditProfile}
        client={client}
        onClose={() => setShowEditProfile(false)}
        onSave={handleSaveProfile}
      />

      {/* Log Session Modal */}
      <Modal visible={showLogSession} transparent animationType="slide" onRequestClose={() => setShowLogSession(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
              <Text style={[typography.h4, { color: colors.text }]}>Записать тренировку</Text>
              <TouchableOpacity onPress={() => setShowLogSession(false)}>
                <Text style={[typography.h4, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Название тренировки *</Text>
            <TextInput
              value={sessionName}
              onChangeText={setSessionName}
              placeholder="Напр. Жим + спина"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            />

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]} numberOfLines={1}>Длительность (мин) *</Text>
                <TextInput
                  value={sessionDuration}
                  onChangeText={setSessionDuration}
                  placeholder="60"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Объём (тонн)</Text>
                <TextInput
                  value={sessionVolume}
                  onChangeText={setSessionVolume}
                  placeholder="8.5"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                />
              </View>
            </View>

            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>Заметки</Text>
            <TextInput
              value={sessionNotes}
              onChangeText={setSessionNotes}
              placeholder="Как прошла тренировка..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={2}
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text, minHeight: 60, textAlignVertical: 'top' }]}
            />

            <Button
              title={savingSession ? 'Сохранение...' : 'Сохранить'}
              onPress={handleLogSession}
              disabled={!sessionName.trim() || !sessionDuration.trim() || savingSession}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm },
  editBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  markDoneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: borderRadius.xl, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: Platform.OS === 'ios' ? 36 : spacing.xl },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md, fontSize: 15 },
});
