import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, TextInput, Modal, Alert, ActivityIndicator, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const PROGRESS_PHOTOS_KEY = 'iron_gym_progress_photos';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ProgressPhoto {
  id: string;
  uri: string;
  date: string; // ISO date string
  note?: string;
}

interface PhotosTabProps {
  colors: any;
}

export const PhotosTab: React.FC<PhotosTabProps> = ({ colors }) => {
  const haptic = useHaptic();

  // Photos-related state
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [photoNoteInput, setPhotoNoteInput] = useState('');
  const [showPhotoNoteModal, setShowPhotoNoteModal] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  // Photos-related callbacks
  const fetchProgressPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    try {
      const raw = await AsyncStorage.getItem(PROGRESS_PHOTOS_KEY);
      if (raw) {
        const data: ProgressPhoto[] = JSON.parse(raw);
        setProgressPhotos(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingPhotos(false);
    }
  }, []);

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к фото в настройках телефона');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingPhotoUri(result.assets[0].uri);
      setPhotoNoteInput('');
      setShowPhotoNoteModal(true);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках телефона');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingPhotoUri(result.assets[0].uri);
      setPhotoNoteInput('');
      setShowPhotoNoteModal(true);
    }
  };

  const handleSavePhoto = async () => {
    if (!pendingPhotoUri) return;
    const newPhoto: ProgressPhoto = {
      id: `photo-${Date.now()}`,
      uri: pendingPhotoUri,
      date: new Date().toISOString(),
      note: photoNoteInput.trim() || undefined,
    };
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
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const updated = progressPhotos.filter((p) => p.id !== id);
          await AsyncStorage.setItem(PROGRESS_PHOTOS_KEY, JSON.stringify(updated));
          setProgressPhotos(updated);
          if (selectedPhotoId === id) setSelectedPhotoId(null);
          haptic.warning();
        },
      },
    ]);
  };

  // Fetch photos on mount
  useEffect(() => {
    fetchProgressPhotos();
  }, [fetchProgressPhotos]);

  return (
    <>
      {/* Header row */}
      <FadeIn delay={0}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <View>
            <Text style={[typography.h3, { color: colors.text }]}>Фото прогресса</Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
              {progressPhotos.length} {progressPhotos.length === 1 ? 'фото' : progressPhotos.length < 5 ? 'фото' : 'фото'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {progressPhotos.length >= 2 && (
              <TouchableOpacity
                onPress={() => { haptic.selection(); setCompareMode((v) => !v); }}
                style={[
                  styles.photoActionBtn,
                  { backgroundColor: compareMode ? colors.primary : colors.surface, borderColor: colors.border },
                ]}
              >
                <Text style={[typography.captionMedium, { color: compareMode ? '#fff' : colors.text }]}>
                  Сравнить
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </FadeIn>

      {/* Add photo buttons */}
      <FadeIn delay={60}>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}>
          <TouchableOpacity
            onPress={handleTakePhoto}
            style={[styles.addPhotoBtn, { backgroundColor: colors.primary, flex: 1 }]}
          >
            <Text style={{ fontSize: 20 }}>📷</Text>
            <Text style={[typography.captionMedium, { color: '#fff', marginTop: 4 }]}>Камера</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddPhoto}
            style={[styles.addPhotoBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
          >
            <Text style={{ fontSize: 20 }}>🖼️</Text>
            <Text style={[typography.captionMedium, { color: colors.text, marginTop: 4 }]}>Галерея</Text>
          </TouchableOpacity>
        </View>
      </FadeIn>

      {/* Compare view -- side by side */}
      {compareMode && progressPhotos.length >= 2 && (
        <FadeIn delay={80}>
          <Card style={{ marginBottom: spacing.xl }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md, textAlign: 'center' }]}>
              СРАВНЕНИЕ: первое vs последнее
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {[progressPhotos[progressPhotos.length - 1], progressPhotos[0]].map((photo, idx) => (
                <View key={photo.id} style={{ flex: 1 }}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: borderRadius.md }}
                    resizeMode="cover"
                  />
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }]}>
                    {idx === 0 ? 'Начало' : 'Сейчас'}
                  </Text>
                  <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center' }]}>
                    {new Date(photo.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              ))}
            </View>
            {progressPhotos.length >= 2 && (() => {
              const firstDate = new Date(progressPhotos[progressPhotos.length - 1].date);
              const lastDate = new Date(progressPhotos[0].date);
              const days = Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
              return days > 0 ? (
                <Text style={[typography.captionMedium, { color: colors.primary, textAlign: 'center', marginTop: spacing.md }]}>
                  {days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} трансформации
                </Text>
              ) : null;
            })()}
          </Card>
        </FadeIn>
      )}

      {/* Loading state */}
      {loadingPhotos && (
        <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {/* Empty state */}
      {!loadingPhotos && progressPhotos.length === 0 && (
        <FadeIn delay={120}>
          <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
            <Text style={{ fontSize: 56 }}>📸</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg }]}>
              Начни фото-дневник
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>
              Регулярные фото — лучший способ видеть реальный прогресс, который цифры не всегда показывают
            </Text>
          </View>
        </FadeIn>
      )}

      {/* Photos grid */}
      {!loadingPhotos && progressPhotos.length > 0 && (
        <FadeIn delay={100}>
          <View style={styles.photosGrid}>
            {progressPhotos.map((photo, i) => {
              const isSelected = selectedPhotoId === photo.id;
              return (
                <View key={photo.id} style={styles.photoCell}>
                  <TouchableOpacity
                    onPress={() => {
                      haptic.selection();
                      setSelectedPhotoId(isSelected ? null : photo.id);
                    }}
                    onLongPress={() => handleDeletePhoto(photo.id)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={[
                        styles.photoThumb,
                        isSelected && { borderColor: colors.primary, borderWidth: 2 },
                      ]}
                      resizeMode="cover"
                    />
                    {i === 0 && (
                      <View style={[styles.photoBadge, { backgroundColor: colors.primary }]}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>NOW</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: 4, textAlign: 'center', fontSize: 10 }]}>
                    {new Date(photo.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </Text>
                  {photo.note ? (
                    <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', fontSize: 9 }]} numberOfLines={1}>
                      {photo.note}
                    </Text>
                  ) : null}
                  {isSelected && (
                    <TouchableOpacity
                      onPress={() => handleDeletePhoto(photo.id)}
                      style={[styles.deletePhotoBtn, { backgroundColor: colors.error + '20', borderColor: colors.error }]}
                    >
                      <Text style={[typography.small, { color: colors.error, fontSize: 10 }]}>Удалить</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.lg }]}>
            Удержи фото для удаления
          </Text>
        </FadeIn>
      )}

      {/* Photo note modal */}
      <Modal visible={showPhotoNoteModal} transparent animationType="fade" onRequestClose={() => setShowPhotoNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>
              Добавить фото
            </Text>
            {pendingPhotoUri && (
              <Image
                source={{ uri: pendingPhotoUri }}
                style={{ width: '100%', height: 180, borderRadius: borderRadius.md, marginBottom: spacing.md }}
                resizeMode="cover"
              />
            )}
            <TextInput
              style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, height: 48, paddingHorizontal: spacing.md }]}
              value={photoNoteInput}
              onChangeText={setPhotoNoteInput}
              placeholder="Заметка (необязательно)..."
              placeholderTextColor={colors.inputPlaceholder}
              maxLength={80}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
              <TouchableOpacity
                onPress={() => { setShowPhotoNoteModal(false); setPendingPhotoUri(null); }}
                style={[styles.modalBtn, { backgroundColor: colors.surface, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePhoto}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]}
              >
                <Text style={[typography.bodyMedium, { color: '#fff' }]}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photoCell: {
    width: (SCREEN_WIDTH - spacing.xl * 2 - spacing.md * 2) / 3,
    alignItems: 'center',
  },
  photoThumb: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.md,
  },
  photoBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addPhotoBtn: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  deletePhotoBtn: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: { padding: spacing.xl },
  weightInput: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalBtn: {
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
