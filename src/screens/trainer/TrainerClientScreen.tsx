import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useTrainerStore } from '../../store';
import { TrainerClient } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { ProgramPickerModal, EditClientModal } from './components';

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'Похудение', muscle_gain: 'Набор массы', strength: 'Сила',
  endurance: 'Выносливость', general_fitness: 'Общая форма',
};
const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый', expert: 'Эксперт',
};

const FAKE_HISTORY = [
  { date: '2026-04-01', name: 'Толчок — Грудь + Трицепс', duration: 68, volume: 8400 },
  { date: '2026-03-30', name: 'Тяга — Спина + Бицепс', duration: 72, volume: 7200 },
  { date: '2026-03-28', name: 'Ноги', duration: 80, volume: 12600 },
  { date: '2026-03-26', name: 'Толчок — Грудь + Трицепс', duration: 65, volume: 7900 },
];

export const TrainerClientScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { updateClient } = useTrainerStore();
  const [client, setClient] = useState<TrainerClient>(route.params?.client);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [notes, setNotes] = useState(client.notes || '');
  const [notesEditing, setNotesEditing] = useState(false);

  if (!client) { navigation.goBack(); return null; }

  const today = new Date().toISOString().split('T')[0];
  const trainedToday = client.lastVisit === today;

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

  const handleSaveNotes = () => {
    haptic.light();
    setClient((prev) => ({ ...prev, notes }));
    updateClient(client.id, { notes });
    setNotesEditing(false);
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

  const goal = client.goal ? GOAL_LABELS[client.goal] ?? client.goal : null;
  const level = client.level ? LEVEL_LABELS[client.level] ?? client.level : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]} numberOfLines={1}>{client.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={{ fontSize: 32 }}>{client.emoji || '🧑'}</Text>
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
            {goal && <View style={[styles.tag, { backgroundColor: colors.primary + '15' }]}><Text style={[typography.caption, { color: colors.primary }]}>🎯 {goal}</Text></View>}
            {level && <View style={[styles.tag, { backgroundColor: colors.accent + '15' }]}><Text style={[typography.caption, { color: colors.accent }]}>📊 {level}</Text></View>}
            {client.totalWorkouts !== undefined && <View style={[styles.tag, { backgroundColor: colors.success + '15' }]}><Text style={[typography.caption, { color: colors.success }]}>💪 {client.totalWorkouts} тренировок</Text></View>}
          </View>
        </Card>

        {/* Mark training done */}
        <TouchableOpacity onPress={handleMarkTrainingDone} disabled={trainedToday} activeOpacity={0.8} style={{ marginBottom: spacing.lg }}>
          <View style={[styles.markDoneBtn, { backgroundColor: trainedToday ? colors.success + '20' : colors.success, borderColor: colors.success }]}>
            <Text style={{ fontSize: 22 }}>{trainedToday ? '✅' : '🏋️'}</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.bodySemibold, { color: trainedToday ? colors.success : '#fff' }]}>
                {trainedToday ? 'Тренировка отмечена сегодня' : 'Отметить тренировку'}
              </Text>
              <Text style={[typography.small, { color: trainedToday ? colors.success + 'CC' : 'rgba(255,255,255,0.75)' }]}>
                {trainedToday ? `Итого: ${client.totalWorkouts || 0} тренировок` : 'Запишет визит и прибавит тренировку к счётчику'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Assigned Program */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>ПРОГРАММА ТРЕНИРОВОК</Text>
            <TouchableOpacity onPress={() => { haptic.selection(); setShowProgramPicker(true); }} style={[styles.editBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
              <Text style={[typography.caption, { color: colors.primary }]}>Изменить</Text>
            </TouchableOpacity>
          </View>
          {client.assignedProgram
            ? <Text style={[typography.bodySemibold, { color: colors.text }]}>📋 {client.assignedProgram}</Text>
            : <Text style={[typography.body, { color: colors.textTertiary }]}>Программа не назначена</Text>}
        </Card>

        {/* Notes */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>ЗАМЕТКИ ТРЕНЕРА</Text>
            {!notesEditing
              ? <TouchableOpacity onPress={() => setNotesEditing(true)} style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>✎ Редактировать</Text>
                </TouchableOpacity>
              : <TouchableOpacity onPress={handleSaveNotes} style={[styles.editBtn, { backgroundColor: colors.success + '20', borderColor: colors.success + '40' }]}>
                  <Text style={[typography.caption, { color: colors.success }]}>✓ Сохранить</Text>
                </TouchableOpacity>}
          </View>
          {notesEditing
            ? <TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={4} placeholder="Особенности клиента, противопоказания, цели..." placeholderTextColor={colors.textTertiary} style={[styles.notesInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} autoFocus />
            : <Text style={[typography.body, { color: client.notes ? colors.text : colors.textTertiary }]}>{client.notes || 'Нет заметок'}</Text>}
        </Card>

        {/* Recent workouts */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>ПОСЛЕДНИЕ ТРЕНИРОВКИ</Text>
          {FAKE_HISTORY.map((w, i) => (
            <View key={i} style={[styles.workoutRow, i < FAKE_HISTORY.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{w.name}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}{'  •  '}{w.duration} мин
                </Text>
              </View>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>{(w.volume / 1000).toFixed(1)} т</Text>
            </View>
          ))}
        </Card>

        {/* Quick stats */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.huge }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.primary, fontSize: 24 }]}>{Math.round(FAKE_HISTORY.reduce((s, w) => s + w.duration, 0) / FAKE_HISTORY.length)}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. мин</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.success, fontSize: 24 }]}>{((FAKE_HISTORY.reduce((s, w) => s + w.volume, 0) / FAKE_HISTORY.length) / 1000).toFixed(1)}т</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. объём</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.accent, fontSize: 24 }]}>4</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>трен/нед</Text>
          </Card>
        </View>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm },
  editBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  notesInput: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, minHeight: 100, textAlignVertical: 'top', fontSize: 15 },
  markDoneBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: borderRadius.xl, borderWidth: 1.5, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
