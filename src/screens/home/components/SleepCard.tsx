import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useThemeStore } from '../../../store';
import { useSleepStore } from '../../../store/useSleepStore';
import { Card } from '../../../components';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const getDurationColor = (hours: number): string => {
  if (hours < 6) return '#EF4444';
  if (hours < 7) return '#F59E0B';
  if (hours <= 9) return '#10B981';
  return '#F59E0B';
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const SleepCard: React.FC = () => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const { entries, addEntry, getAverageDuration } = useSleepStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality, setQuality] = useState(3);

  const lastEntry = entries.length > 0 ? entries[0] : null;
  const avgDuration = getAverageDuration(7);

  const openModal = () => {
    haptic.selection();
    setBedtime('23:00');
    setWakeTime('07:00');
    setQuality(3);
    setModalVisible(true);
  };

  const validateTime = (time: string): boolean => {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  };

  const handleSave = () => {
    if (!validateTime(bedtime) || !validateTime(wakeTime)) {
      Alert.alert('Ошибка', 'Введите время в формате ЧЧ:ММ (например, 23:00)');
      return;
    }
    addEntry({
      date: todayStr(),
      bedtime,
      wakeTime,
      quality,
    });
    haptic.success();
    setModalVisible(false);
  };

  return (
    <>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h4, { color: colors.text }]}>Сон</Text>
            {lastEntry ? (
              <View style={{ marginTop: 4 }}>
                <Text style={[typography.small, { color: getDurationColor(lastEntry.durationHours) }]}>
                  {lastEntry.durationHours} ч  ({lastEntry.bedtime} — {lastEntry.wakeTime})
                </Text>
                {lastEntry.quality && (
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                    {'★'.repeat(lastEntry.quality)}{'☆'.repeat(5 - lastEntry.quality)}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>Нет данных</Text>
            )}
            {avgDuration > 0 && (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={[typography.small, { color: colors.textSecondary }]}>Среднее за 7 дней: {avgDuration} ч</Text>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 4, width: '100%' }}>
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: getDurationColor(avgDuration),
                      width: `${Math.min(100, (avgDuration / 10) * 100)}%`,
                    }}
                  />
                </View>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={openModal}
            style={{
              backgroundColor: colors.primary + '15',
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              borderRadius: borderRadius.md,
              borderWidth: 1.5,
              borderColor: colors.primary,
              marginLeft: spacing.md,
            }}
          >
            <Text style={[typography.buttonSmall, { color: colors.primary }]}>🌙 Записать</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }}>
          <View style={{ width: '100%', borderRadius: borderRadius.xl, padding: spacing.xl, backgroundColor: colors.card }}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Запись сна</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
              Введите время отхода ко сну и пробуждения
            </Text>

            <Text style={[typography.bodyMedium, { color: colors.text, marginBottom: spacing.xs }]}>Лёг спать</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, marginBottom: spacing.md }}>
              <TextInput
                value={bedtime}
                onChangeText={setBedtime}
                placeholder="23:00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                style={[typography.h2, { color: colors.text, textAlign: 'center', flex: 1 }]}
                maxLength={5}
              />
            </View>

            <Text style={[typography.bodyMedium, { color: colors.text, marginBottom: spacing.xs }]}>Проснулся</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, marginBottom: spacing.md }}>
              <TextInput
                value={wakeTime}
                onChangeText={setWakeTime}
                placeholder="07:00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                style={[typography.h2, { color: colors.text, textAlign: 'center', flex: 1 }]}
                maxLength={5}
              />
            </View>

            <Text style={[typography.bodyMedium, { color: colors.text, marginBottom: spacing.xs }]}>Качество сна</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => { haptic.selection(); setQuality(star); }}>
                  <Text style={{ fontSize: 28, color: star <= quality ? '#F59E0B' : colors.border }}>
                    {star <= quality ? '★' : '☆'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{ flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', backgroundColor: colors.surface }}
              >
                <Text style={[typography.buttonMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{ flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', backgroundColor: colors.primary }}
              >
                <Text style={[typography.buttonMedium, { color: '#fff' }]}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};
