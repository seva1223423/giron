import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { TrainerClient } from '../../../store';

const EMOJI_OPTIONS = ['◉', '◎', '◈', '◧', '◫', '◑', '○', '●', '◇', '◆', '□', '■'];

const GOAL_OPTIONS = [
  { value: 'weight_loss', label: 'Похудение', icon: '◎' },
  { value: 'muscle_gain', label: 'Набор массы', icon: '◉' },
  { value: 'strength', label: 'Сила', icon: '◈' },
  { value: 'endurance', label: 'Выносливость', icon: '◧' },
  { value: 'general_fitness', label: 'Общая форма', icon: '◑' },
];

const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Новичок' },
  { value: 'intermediate', label: 'Средний' },
  { value: 'advanced', label: 'Продвинутый' },
  { value: 'expert', label: 'Эксперт' },
];

interface Props {
  visible: boolean;
  client: TrainerClient;
  onClose: () => void;
  onSave: (patch: Partial<TrainerClient>) => void;
}

export const EditClientModal: React.FC<Props> = ({ visible, client, onClose, onSave }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { height: screenHeight } = useWindowDimensions();

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGoal, setEditGoal] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [editEmoji, setEditEmoji] = useState('◉');

  useEffect(() => {
    if (visible) {
      setEditName(client.name || '');
      setEditPhone(client.phone || '');
      setEditAge(client.age ? String(client.age) : '');
      setEditGoal(client.goal || '');
      setEditLevel(client.level || '');
      setEditEmoji(client.emoji || '◉');
    }
  }, [visible, client]);

  const handleSave = () => {
    haptic.medium();
    const age = editAge ? parseInt(editAge.replace(',', '.'), 10) || undefined : undefined;
    onSave({
      name: editName.trim() || client.name,
      age,
      goal: editGoal || undefined,
      level: editLevel || undefined,
      emoji: editEmoji,
      phone: editPhone.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Профиль клиента</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Math.min(520, screenHeight * 0.65) }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>АВАТАР</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {EMOJI_OPTIONS.map((em) => (
                <TouchableOpacity
                  key={em}
                  onPress={() => { haptic.selection(); setEditEmoji(em); }}
                  style={[styles.emojiOption, { backgroundColor: editEmoji === em ? colors.primary + '20' : colors.background, borderColor: editEmoji === em ? colors.primary : colors.border }]}
                >
                  <Text style={{ fontSize: 24 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ИМЯ</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Имя клиента"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: spacing.md }]}
            />

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ТЕЛЕФОН</Text>
            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+7 900 000 0000"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: spacing.md }]}
            />

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>ВОЗРАСТ</Text>
            <TextInput
              value={editAge}
              onChangeText={setEditAge}
              placeholder="Лет"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, marginBottom: spacing.lg }]}
            />

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ЦЕЛЬ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {GOAL_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  onPress={() => { haptic.selection(); setEditGoal(editGoal === g.value ? '' : g.value); }}
                  style={[styles.chip, { backgroundColor: editGoal === g.value ? colors.primary + '20' : colors.background, borderColor: editGoal === g.value ? colors.primary : colors.border }]}
                >
                  <Text style={[typography.caption, { color: editGoal === g.value ? colors.primary : colors.text }]}>{g.icon} {g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>УРОВЕНЬ</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl }}>
              {LEVEL_OPTIONS.map((l) => (
                <TouchableOpacity
                  key={l.value}
                  onPress={() => { haptic.selection(); setEditLevel(editLevel === l.value ? '' : l.value); }}
                  style={[styles.chip, { backgroundColor: editLevel === l.value ? colors.accent + '20' : colors.background, borderColor: editLevel === l.value ? colors.accent : colors.border }]}
                >
                  <Text style={[typography.caption, { color: editLevel === l.value ? colors.accent : colors.text }]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
            <Button title="Отмена" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Сохранить" onPress={handleSave} style={{ flex: 1 }} disabled={!editName.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  emojiOption: { width: 48, height: 48, borderRadius: borderRadius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 16 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.lg, borderWidth: 1.5 },
});
