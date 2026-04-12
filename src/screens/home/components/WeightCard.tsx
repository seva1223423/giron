import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { userService } from '../../../services/userService';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { User } from '../../../types';

interface Props {
  user: User | null;
  setUser: (u: User) => void;
}

export const WeightCard: React.FC<Props> = ({ user, setUser }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const [modalVisible, setModalVisible] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    haptic.selection();
    setWeightInput(user?.weightKg ? String(user.weightKg) : '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (!kg || kg < 20 || kg > 400) {
      Alert.alert('Некорректный вес', 'Введите вес от 20 до 400 кг');
      return;
    }
    setSaving(true);
    try {
      await userService.addWeight(kg);
      if (user) setUser({ ...user, weightKg: kg });
      haptic.success();
      setModalVisible(false);
      setWeightInput('');
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить вес');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[typography.h4, { color: colors.text }]}>Вес тела</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
              {user?.weightKg ? `${user.weightKg} кг` : 'Не записано'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={openModal}
            style={{ backgroundColor: colors.primary + '15', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.primary }}
          >
            <Text style={[typography.buttonSmall, { color: colors.primary }]}>Записать</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
          <View style={{ width: '100%', borderRadius: borderRadius.xl, padding: spacing.xl, backgroundColor: colors.card }}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Вес тела</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
              Введите текущий вес для отслеживания прогресса
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, backgroundColor: colors.surface, borderColor: colors.border }}>
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder="80.5"
                placeholderTextColor={colors.textTertiary}
                style={[typography.h2, { color: colors.text, textAlign: 'center', flex: 1 }]}
                autoFocus
              />
              <Text style={[typography.body, { color: colors.textSecondary }]}>кг</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={[typography.buttonMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                style={{ flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }}
              >
                <Text style={[typography.buttonMedium, { color: '#fff' }]}>{saving ? 'Сохраняю...' : 'Сохранить'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};
