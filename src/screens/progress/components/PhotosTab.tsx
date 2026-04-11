import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useHaptic } from '../../../hooks/useHaptic';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { PhotoNoteModal, PhotoCompareCard, PhotosGrid } from './photos';

const PROGRESS_PHOTOS_KEY = 'iron_gym_progress_photos';

export interface ProgressPhoto {
  id: string;
  uri: string;
  date: string;
  note?: string;
}

interface PhotosTabProps {
  colors: any;
}

export const PhotosTab: React.FC<PhotosTabProps> = ({ colors }) => {
  const haptic = useHaptic();
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [showPhotoNoteModal, setShowPhotoNoteModal] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  const fetchProgressPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_PHOTOS_KEY);
      if (raw) {
        const data: ProgressPhoto[] = JSON.parse(raw);
        setProgressPhotos(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch {} finally {
      setLoadingPhotos(false);
    }
  }, []);

  useEffect(() => { fetchProgressPhotos(); }, [fetchProgressPhotos]);

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к фото в настройках телефона'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [3, 4], quality: 0.7 });
    if (!result.canceled && result.assets[0]) { setPendingPhotoUri(result.assets[0].uri); setShowPhotoNoteModal(true); }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках телефона'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.7 });
    if (!result.canceled && result.assets[0]) { setPendingPhotoUri(result.assets[0].uri); setShowPhotoNoteModal(true); }
  };

  const handleSavePhoto = async (note: string) => {
    if (!pendingPhotoUri) return;
    const newPhoto: ProgressPhoto = { id: `photo-${Date.now()}`, uri: pendingPhotoUri, date: new Date().toISOString(), note: note || undefined };
    try {
      const updated = [newPhoto, ...progressPhotos];
      await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(updated));
      setProgressPhotos(updated);
      setShowPhotoNoteModal(false);
      setPendingPhotoUri(null);
      haptic.success();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить фото');
    }
  };

  const handleDeletePhoto = async (id: string) => {
    Alert.alert('Удалить фото?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => {
        const updated = progressPhotos.filter((p) => p.id !== id);
        await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(updated));
        setProgressPhotos(updated);
        if (selectedPhotoId === id) setSelectedPhotoId(null);
        haptic.warning();
      }},
    ]);
  };

  return (
    <>
      {/* Header */}
      <FadeIn delay={0}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <View>
            <Text style={[typography.h3, { color: colors.text }]}>Фото прогресса</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>{progressPhotos.length} фото</Text>
          </View>
          {progressPhotos.length >= 2 && (
            <TouchableOpacity onPress={() => { haptic.selection(); setCompareMode((v) => !v); }} style={[styles.actionBtn, { backgroundColor: compareMode ? colors.primary : colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.captionMedium, { color: compareMode ? '#fff' : colors.text }]}>Сравнить</Text>
            </TouchableOpacity>
          )}
        </View>
      </FadeIn>

      {/* Add buttons */}
      <FadeIn delay={60}>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}>
          <TouchableOpacity onPress={takePhoto} style={[styles.addBtn, { backgroundColor: colors.primary, flex: 1 }]}>
            <Text style={{ fontSize: 20 }}>📷</Text>
            <Text style={[typography.captionMedium, { color: '#fff', marginTop: 4 }]}>Камера</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickFromGallery} style={[styles.addBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1 }]}>
            <Text style={{ fontSize: 20 }}>🖼️</Text>
            <Text style={[typography.captionMedium, { color: colors.text, marginTop: 4 }]}>Галерея</Text>
          </TouchableOpacity>
        </View>
      </FadeIn>

      {compareMode && <PhotoCompareCard photos={progressPhotos} delay={80} />}

      {loadingPhotos && <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.xl }} />}

      {!loadingPhotos && progressPhotos.length === 0 && (
        <FadeIn delay={120}>
          <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary }}>◧</Text></View>
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg }]}>Начни фото-дневник</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>
              Регулярные фото — лучший способ видеть реальный прогресс, который цифры не всегда показывают
            </Text>
          </View>
        </FadeIn>
      )}

      <PhotosGrid photos={progressPhotos} selectedId={selectedPhotoId} onSelect={setSelectedPhotoId} onDelete={handleDeletePhoto} delay={100} />

      <PhotoNoteModal
        visible={showPhotoNoteModal}
        pendingPhotoUri={pendingPhotoUri}
        onClose={() => { setShowPhotoNoteModal(false); setPendingPhotoUri(null); }}
        onSave={handleSavePhoto}
      />
    </>
  );
};

const styles = StyleSheet.create({
  actionBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  addBtn: { paddingVertical: spacing.lg, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
});
