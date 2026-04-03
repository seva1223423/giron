import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useTrainerStore } from '../../store';
import { TrainerClient } from '../../store';
import { Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const PROGRAMS = [
  'Толчок-Тяга-Ноги',
  'Верх / Низ',
  'Стартовая сила',
  'Бро-сплит',
  'Фулбоди',
  'Кардио + Тонус',
];

const GOAL_OPTIONS = [
  { value: 'weight_loss', label: 'Похудение', icon: '🔥' },
  { value: 'muscle_gain', label: 'Набор массы', icon: '💪' },
  { value: 'strength', label: 'Сила', icon: '🏋️' },
  { value: 'endurance', label: 'Выносливость', icon: '🏃' },
  { value: 'general_fitness', label: 'Общая форма', icon: '⚡' },
];

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Новичок' },
  { value: 'intermediate', label: 'Средний' },
  { value: 'advanced', label: 'Продвинутый' },
  { value: 'expert', label: 'Эксперт' },
];

const EMOJI_OPTIONS = ['🧑', '💪', '🏃', '🏋️', '🧘', '🚴', '🤸', '🏊', '⚽', '🎯', '🦾', '🔥'];

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

export const TrainerClientScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { updateClient } = useTrainerStore();
  const [client, setClient] = useState<TrainerClient>(route.params?.client);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [notes, setNotes] = useState(client.notes || '');
  const [notesEditing, setNotesEditing] = useState(false);

  // Edit profile form state
  const [editAge, setEditAge] = useState(client.age ? String(client.age) : '');
  const [editGoal, setEditGoal] = useState(client.goal || '');
  const [editLevel, setEditLevel] = useState(client.level || '');
  const [editEmoji, setEditEmoji] = useState(client.emoji || '🧑');
  const [editPhone, setEditPhone] = useState(client.phone || '');
  const [editName, setEditName] = useState(client.name || '');

  if (!client) { navigation.goBack(); return null; }

  const handleAssignProgram = (program: string) => {
    haptic.selection();
    const updated = { ...client, assignedProgram: program };
    setClient(updated);
    updateClient(client.id, { assignedProgram: program });
    setShowProgramPicker(false);
  };

  const handleSaveNotes = () => {
    haptic.light();
    const updated = { ...client, notes };
    setClient(updated);
    updateClient(client.id, { notes });
    setNotesEditing(false);
  };

  const handleOpenEditProfile = () => {
    haptic.selection();
    setEditAge(client.age ? String(client.age) : '');
    setEditGoal(client.goal || '');
    setEditLevel(client.level || '');
    setEditEmoji(client.emoji || '🧑');
    setEditPhone(client.phone || '');
    setEditName(client.name || '');
    setShowEditProfile(true);
  };

  const handleSaveProfile = () => {
    haptic.medium();
    const age = editAge ? parseInt(editAge) || undefined : undefined;
    const patch: Partial<TrainerClient> = {
      name: editName.trim() || client.name,
      age,
      goal: editGoal || undefined,
      level: editLevel || undefined,
      emoji: editEmoji,
      phone: editPhone.trim() || undefined,
    };
    const updated = { ...client, ...patch };
    setClient(updated);
    updateClient(client.id, patch);
    setShowEditProfile(false);
  };

  const handleMarkTrainingDone = () => {
    const today = new Date().toISOString().split('T')[0];
    if (client.lastVisit === today) return; // already logged today
    haptic.success();
    const patch: Partial<TrainerClient> = {
      lastVisit: today,
      totalWorkouts: (client.totalWorkouts || 0) + 1,
    };
    setClient((prev) => ({ ...prev, ...patch }));
    updateClient(client.id, patch);
  };

  const today = new Date().toISOString().split('T')[0];
  const trainedToday = client.lastVisit === today;

  const age = client.age ? `${client.age} лет` : null;
  const goal = client.goal ? GOAL_LABELS[client.goal] ?? client.goal : null;
  const level = client.level ? LEVEL_LABELS[client.level] ?? client.level : null;

  // Fake workout history for demo
  const fakeHistory = [
    { date: '2026-04-01', name: 'Толчок — Грудь + Трицепс', duration: 68, volume: 8400 },
    { date: '2026-03-30', name: 'Тяга — Спина + Бицепс', duration: 72, volume: 7200 },
    { date: '2026-03-28', name: 'Ноги', duration: 80, volume: 12600 },
    { date: '2026-03-26', name: 'Толчок — Грудь + Трицепс', duration: 65, volume: 7900 },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
                {age && <Text style={[typography.caption, { color: colors.textSecondary }]}>{age}</Text>}
                {client.phone && <Text style={[typography.caption, { color: colors.textSecondary }]}>{client.phone}</Text>}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleOpenEditProfile}
              style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>✎ Изменить</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tagsRow}>
            {goal && (
              <View style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[typography.caption, { color: colors.primary }]}>🎯 {goal}</Text>
              </View>
            )}
            {level && (
              <View style={[styles.tag, { backgroundColor: colors.accent + '15' }]}>
                <Text style={[typography.caption, { color: colors.accent }]}>📊 {level}</Text>
              </View>
            )}
            {client.totalWorkouts !== undefined && (
              <View style={[styles.tag, { backgroundColor: colors.success + '15' }]}>
                <Text style={[typography.caption, { color: colors.success }]}>💪 {client.totalWorkouts} тренировок</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Mark training done */}
        <TouchableOpacity
          onPress={handleMarkTrainingDone}
          disabled={trainedToday}
          activeOpacity={0.8}
          style={{ marginBottom: spacing.lg }}
        >
          <View
            style={[
              styles.markDoneBtn,
              {
                backgroundColor: trainedToday ? colors.success + '20' : colors.success,
                borderColor: colors.success,
              },
            ]}
          >
            <Text style={{ fontSize: 22 }}>{trainedToday ? '✅' : '🏋️'}</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[typography.bodySemibold, { color: trainedToday ? colors.success : '#fff' }]}>
                {trainedToday ? 'Тренировка отмечена сегодня' : 'Отметить тренировку'}
              </Text>
              <Text style={[typography.small, { color: trainedToday ? colors.success + 'CC' : 'rgba(255,255,255,0.75)' }]}>
                {trainedToday
                  ? `Итого: ${client.totalWorkouts || 0} тренировок`
                  : 'Запишет визит и прибавит тренировку к счётчику'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Assigned Program */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>ПРОГРАММА ТРЕНИРОВОК</Text>
            <TouchableOpacity
              onPress={() => { haptic.selection(); setShowProgramPicker(true); }}
              style={[styles.editBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}
            >
              <Text style={[typography.caption, { color: colors.primary }]}>Изменить</Text>
            </TouchableOpacity>
          </View>
          {client.assignedProgram ? (
            <Text style={[typography.bodySemibold, { color: colors.text }]}>
              📋 {client.assignedProgram}
            </Text>
          ) : (
            <Text style={[typography.body, { color: colors.textTertiary }]}>Программа не назначена</Text>
          )}
        </Card>

        {/* Notes */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>ЗАМЕТКИ ТРЕНЕРА</Text>
            {!notesEditing ? (
              <TouchableOpacity
                onPress={() => setNotesEditing(true)}
                style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[typography.caption, { color: colors.textSecondary }]}>✎ Редактировать</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSaveNotes}
                style={[styles.editBtn, { backgroundColor: colors.success + '20', borderColor: colors.success + '40' }]}
              >
                <Text style={[typography.caption, { color: colors.success }]}>✓ Сохранить</Text>
              </TouchableOpacity>
            )}
          </View>
          {notesEditing ? (
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              placeholder="Особенности клиента, противопоказания, цели..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.notesInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              autoFocus
            />
          ) : (
            <Text style={[typography.body, { color: client.notes ? colors.text : colors.textTertiary }]}>
              {client.notes || 'Нет заметок'}
            </Text>
          )}
        </Card>

        {/* Recent workouts */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            ПОСЛЕДНИЕ ТРЕНИРОВКИ
          </Text>
          {fakeHistory.map((w, i) => (
            <View
              key={i}
              style={[
                styles.workoutRow,
                i < fakeHistory.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{w.name}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {new Date(w.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  {'  •  '}
                  {w.duration} мин
                </Text>
              </View>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>
                {(w.volume / 1000).toFixed(1)} т
              </Text>
            </View>
          ))}
        </Card>

        {/* Quick stats */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.huge }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.primary, fontSize: 24 }]}>
              {Math.round(fakeHistory.reduce((s, w) => s + w.duration, 0) / fakeHistory.length)}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. мин</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.success, fontSize: 24 }]}>
              {((fakeHistory.reduce((s, w) => s + w.volume, 0) / fakeHistory.length) / 1000).toFixed(1)}т
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>ср. объём</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.accent, fontSize: 24 }]}>4</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>трен/нед</Text>
          </Card>
        </View>
      </ScrollView>

      {/* Program picker modal */}
      <Modal visible={showProgramPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Назначить программу
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
              {PROGRAMS.map((program) => {
                const isActive = client.assignedProgram === program;
                return (
                  <TouchableOpacity
                    key={program}
                    onPress={() => handleAssignProgram(program)}
                    style={[styles.programRow, { borderBottomColor: colors.divider }]}
                  >
                    <Text style={[typography.body, { color: isActive ? colors.primary : colors.text, flex: 1 }]}>
                      📋 {program}
                    </Text>
                    {isActive && <Text style={{ color: colors.primary }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => { haptic.selection(); setClient((prev) => ({ ...prev, assignedProgram: undefined })); updateClient(client.id, { assignedProgram: undefined }); setShowProgramPicker(false); }}
                style={[styles.programRow, { borderBottomColor: colors.divider }]}
              >
                <Text style={[typography.body, { color: colors.textSecondary }]}>Убрать программу</Text>
              </TouchableOpacity>
            </ScrollView>
            <Button
              title="Отмена"
              variant="ghost"
              onPress={() => setShowProgramPicker(false)}
              fullWidth
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>

      {/* Edit profile modal */}
      <Modal visible={showEditProfile} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Профиль клиента
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Emoji picker */}
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>АВАТАР</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {EMOJI_OPTIONS.map((em) => (
                  <TouchableOpacity
                    key={em}
                    onPress={() => { haptic.selection(); setEditEmoji(em); }}
                    style={[
                      styles.emojiOption,
                      {
                        backgroundColor: editEmoji === em ? colors.primary + '20' : colors.background,
                        borderColor: editEmoji === em ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 24 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Name */}
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ИМЯ</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Имя клиента"
                placeholderTextColor={colors.textTertiary}
                style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: spacing.md }]}
              />

              {/* Phone */}
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ТЕЛЕФОН</Text>
              <TextInput
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="+7 900 000 0000"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: spacing.md }]}
              />

              {/* Age */}
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ВОЗРАСТ</Text>
              <TextInput
                value={editAge}
                onChangeText={setEditAge}
                placeholder="Лет"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: spacing.lg }]}
              />

              {/* Goal */}
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ЦЕЛЬ</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {GOAL_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g.value}
                    onPress={() => { haptic.selection(); setEditGoal(editGoal === g.value ? '' : g.value); }}
                    style={[
                      styles.chipOption,
                      {
                        backgroundColor: editGoal === g.value ? colors.primary + '20' : colors.background,
                        borderColor: editGoal === g.value ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[typography.caption, { color: editGoal === g.value ? colors.primary : colors.text }]}>
                      {g.icon} {g.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Level */}
              <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>УРОВЕНЬ</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl }}>
                {LEVEL_OPTIONS.map((l) => (
                  <TouchableOpacity
                    key={l.value}
                    onPress={() => { haptic.selection(); setEditLevel(editLevel === l.value ? '' : l.value); }}
                    style={[
                      styles.chipOption,
                      {
                        backgroundColor: editLevel === l.value ? colors.accent + '20' : colors.background,
                        borderColor: editLevel === l.value ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text style={[typography.caption, { color: editLevel === l.value ? colors.accent : colors.text }]}>
                      {l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <Button
                title="Отмена"
                variant="ghost"
                onPress={() => setShowEditProfile(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Сохранить"
                onPress={handleSaveProfile}
                style={{ flex: 1 }}
                disabled={!editName.trim()}
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
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  editBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 15,
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
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  chipOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  markDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
