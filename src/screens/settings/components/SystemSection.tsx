import React, { useEffect, useState } from 'react';
import { Text, Switch, Share, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { useNutritionStore } from '../../../store/useNutritionStore';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { SettingRow } from './SettingRow';
import { useHaptic } from '../../../hooks/useHaptic';
import { getStorageUsage, StorageUsage } from '../../../utils/storage';

export const SystemSection: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { hapticFeedback, setHapticFeedback } = useSettingsStore();
  const [storageInfo, setStorageInfo] = useState<StorageUsage | null>(null);

  useEffect(() => {
    getStorageUsage().then(setStorageInfo).catch(() => {});
  }, []);

  const handleExportCSV = async () => {
    const { workoutHistory } = useWorkoutStore.getState();
    if (workoutHistory.length === 0) {
      Alert.alert('Нет данных', 'Пока нет завершённых тренировок для экспорта.');
      return;
    }

    const headers = 'Дата,Тренировка,Длительность (мин),Объём (кг),Упражнений,Подходов';
    const rows = workoutHistory.map((w) => {
      const date = w.completedAt ? new Date(w.completedAt).toLocaleDateString('ru-RU') : '';
      const sets = (w.exercises ?? []).reduce((s, ex) => s + (ex.sets ?? []).filter((set) => set.completed).length, 0);
      return `${date},"${w.name}",${w.durationMinutes || 0},${Math.round(w.totalVolume || 0)},${(w.exercises ?? []).length},${sets}`;
    });

    const csv = [headers, ...rows].join('\n');

    try {
      await Share.share({ message: csv, title: 'Iron Gym Workouts.csv' });
    } catch {}
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || !result.assets?.length) return;
      const uri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(uri);
      const data = JSON.parse(content);

      if (!data.exportedAt) {
        Alert.alert('Ошибка', 'Неверный формат файла');
        return;
      }

      Alert.alert('Восстановить данные?', 'Текущие данные будут заменены.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Восстановить', style: 'destructive', onPress: async () => {
          if (data.workouts) await AsyncStorage.setItem('iron-gym-workouts', JSON.stringify(data.workouts));
          if (data.nutrition) await AsyncStorage.setItem('iron-gym-nutrition', JSON.stringify(data.nutrition));
          if (data.settings) await AsyncStorage.setItem('iron-gym-settings', JSON.stringify(data.settings));
          Alert.alert('Готово', 'Данные восстановлены. Перезапустите приложение для применения.');
        }},
      ]);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось прочитать файл');
    }
  };

  const handleExport = async () => {
    try {
      const [workouts, nutrition, settings] = await Promise.all([
        AsyncStorage.getItem('iron-gym-workouts'),
        AsyncStorage.getItem('iron-gym-nutrition'),
        AsyncStorage.getItem('iron-gym-settings'),
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        workouts: workouts ? JSON.parse(workouts) : null,
        nutrition: nutrition ? JSON.parse(nutrition) : null,
        settings: settings ? JSON.parse(settings) : null,
      };
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'Iron Gym Backup' });
    } catch {
      // Silently fail
    }
  };

  return (
    <FadeIn delay={240}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.5 }]}>СИСТЕМА</Text>
        <SettingRow
          label="Тактильный отклик"
          right={
            <Switch
              value={hapticFeedback}
              onValueChange={(v) => { if (v) haptic.selection(); setHapticFeedback(v); }}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={hapticFeedback ? colors.primary : '#f4f3f4'}
            />
          }
        />
        <SettingRow
          label="Язык"
          sublabel="Русский"
          divider
          right={<Text style={[typography.body, { color: colors.textSecondary }]}>Русский</Text>}
        />
        <SettingRow
          label="Экспорт данных"
          sublabel="JSON бэкап всех данных"
          divider
          onPress={handleExport}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />
        <SettingRow
          label="Экспорт тренировок"
          sublabel="CSV таблица для Excel"
          divider
          onPress={handleExportCSV}
          right={<Text style={[typography.body, { color: colors.primary }]}>CSV</Text>}
        />
        <SettingRow
          label="Импорт данных"
          sublabel="Восстановить из JSON бэкапа"
          divider
          onPress={handleImport}
          right={<Text style={[typography.body, { color: colors.primary }]}>→</Text>}
        />
        {storageInfo && (
          <SettingRow
            label="Использование хранилища"
            sublabel={`${storageInfo.totalMB} МБ из 6 МБ`}
            divider
            right={
              <Text style={[typography.body, { color: storageInfo.warningLevel === 'critical' ? colors.error : storageInfo.warningLevel === 'warning' ? colors.warning : colors.success }]}>
                {storageInfo.warningLevel === 'ok' ? '✓' : storageInfo.warningLevel === 'warning' ? '!' : '!!'}
              </Text>
            }
          />
        )}
        <SettingRow
          label="Очистить старые данные"
          sublabel="Удалить записи питания старше 90 дней"
          onPress={() => {
            Alert.alert('Очистить?', 'Записи питания старше 90 дней будут удалены.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Очистить', style: 'destructive', onPress: () => {
                useNutritionStore.getState().cleanupOldLogs(90);
                getStorageUsage().then(setStorageInfo).catch(() => {});
                haptic.success();
              }},
            ]);
          }}
          right={<Text style={[typography.body, { color: colors.error }]}>🗑</Text>}
        />
      </Card>
    </FadeIn>
  );
};
