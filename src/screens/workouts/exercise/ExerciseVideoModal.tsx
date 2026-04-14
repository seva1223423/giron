import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Image,
  Linking, Animated, ScrollView, useWindowDimensions,
} from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  youtubeId?: string;
  primaryMuscles: string[];
  muscleLabels: Record<string, string>;
  description?: string;
  instructions?: string[];
  tips?: string[];
  commonMistakes?: string[];
}

// YouTube video IDs are exactly 11 chars: alphanumeric + hyphen + underscore.
// Validating prevents URL injection in case the backend or DB is ever compromised.
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

async function openYouTube(youtubeId?: string, exerciseName?: string) {
  try {
    const query = encodeURIComponent(`${exerciseName || ''} техника выполнения`);
    if (youtubeId && YOUTUBE_ID_RE.test(youtubeId)) {
      const appUrl = `youtube://www.youtube.com/watch?v=${youtubeId}`;
      const webUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      const canApp = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canApp ? appUrl : webUrl);
    } else {
      const appUrl = `youtube://results?search_query=${query}`;
      const webUrl = `https://www.youtube.com/results?search_query=${query}`;
      const canApp = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canApp ? appUrl : webUrl);
    }
  } catch {
    const query = encodeURIComponent(`${exerciseName || ''} техника выполнения`);
    Linking.openURL(`https://www.youtube.com/results?search_query=${query}`);
  }
}

export const ExerciseVideoModal: React.FC<Props> = ({
  visible, onClose, exerciseName, youtubeId,
  primaryMuscles, muscleLabels, description, instructions, tips, commonMistakes,
}) => {
  const { colors } = useThemeStore();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const THUMB_H = Math.round((screenW * 9) / 16);
  const safeYoutubeId = youtubeId && YOUTUBE_ID_RE.test(youtubeId) ? youtubeId : undefined;
  const thumbUrl = safeYoutubeId ? `https://img.youtube.com/vi/${safeYoutubeId}/maxresdefault.jpg` : null;
  const [activeTab, setActiveTab] = useState<'steps' | 'tips'>('steps');

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);

  const slideAnim = useRef(new Animated.Value(700)).current;
  useEffect(() => {
    if (visible) {
      setActiveTab('steps');
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
    } else {
      slideAnim.setValue(700);
    }
  }, [visible]);

  const hasTips = (tips?.length ?? 0) > 0;
  const hasMistakes = (commonMistakes?.length ?? 0) > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] }]}>
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* YouTube thumbnail */}
        <TouchableOpacity activeOpacity={0.88} onPress={() => openYouTube(safeYoutubeId, exerciseName)} style={[styles.thumbnailWrapper, { height: THUMB_H }]}>
          {thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.placeholderIcon}>▶</Text>
              <Text style={styles.placeholderText}>Найти в YouTube</Text>
            </View>
          )}
          <View style={styles.overlay} />
          <Text style={styles.muscleLabel}>
            {primaryMuscles.slice(0, 3).map((m) => muscleLabels[m] || m).join(' · ')}
          </Text>
          <Animated.View style={[styles.playWrapper, { transform: [{ scale: pulse }] }]}>
            <View style={styles.playCircle}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          </Animated.View>
          <View style={styles.ytBadge}>
            <Text style={styles.ytBadgeText}>{youtubeId ? 'YouTube' : 'Найти'}</Text>
          </View>
        </TouchableOpacity>

        {/* Exercise name + description */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
          <Text style={[typography.h4, { color: colors.text }]}>{exerciseName}</Text>
          {description && (
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>

        {/* Tab switcher */}
        {(hasTips || hasMistakes) && (
          <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm }}>
            <TouchableOpacity
              onPress={() => setActiveTab('steps')}
              style={[styles.tabBtn, { borderColor: activeTab === 'steps' ? colors.primary : colors.border, backgroundColor: activeTab === 'steps' ? colors.primary + '10' : 'transparent' }]}
            >
              <Text style={[typography.small, { color: activeTab === 'steps' ? colors.primary : colors.textSecondary, fontWeight: '600' }]}>
                Техника ({instructions?.length ?? 0})
              </Text>
            </TouchableOpacity>
            {hasTips && (
              <TouchableOpacity
                onPress={() => setActiveTab('tips')}
                style={[styles.tabBtn, { borderColor: activeTab === 'tips' ? colors.success : colors.border, backgroundColor: activeTab === 'tips' ? colors.success + '10' : 'transparent' }]}
              >
                <Text style={[typography.small, { color: activeTab === 'tips' ? colors.success : colors.textSecondary, fontWeight: '600' }]}>
                  Советы {hasMistakes ? `+ Ошибки` : `(${tips!.length})`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Scrollable content */}
        <ScrollView style={{ maxHeight: Math.min(220, screenH * 0.28) }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
          {activeTab === 'steps' && instructions && instructions.map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              <View style={[styles.stepDot, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{step}</Text>
            </View>
          ))}

          {activeTab === 'tips' && (
            <>
              {hasTips && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.success }]}>СОВЕТЫ</Text>
                  {tips!.map((tip, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                      <Text style={{ fontSize: 12, color: colors.success }}>✓</Text>
                      <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{tip}</Text>
                    </View>
                  ))}
                </>
              )}
              {hasMistakes && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.error, marginTop: spacing.sm }]}>ТИПИЧНЫЕ ОШИБКИ</Text>
                  {commonMistakes!.map((m, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                      <Text style={{ fontSize: 12, color: colors.error }}>✕</Text>
                      <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{m}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* CTA buttons */}
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          <TouchableOpacity style={[styles.watchBtn]} onPress={() => openYouTube(safeYoutubeId, exerciseName)}>
            <Text style={styles.watchBtnText}>{youtubeId ? '▶ Открыть в YouTube' : '🔍 Найти в YouTube'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.border }]} onPress={onClose}>
            <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden', paddingBottom: 36,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  thumbnailWrapper: { width: '100%', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailPlaceholder: { backgroundColor: '#0F0F1A', alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 44, marginBottom: 8, color: '#FFF' },
  placeholderText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  muscleLabel: {
    position: 'absolute', top: 12, left: 14,
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  playWrapper: { position: 'absolute' },
  playCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF0000',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF0000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 14, elevation: 10,
  },
  playIcon: { color: '#FFF', fontSize: 26, marginLeft: 4 },
  ytBadge: { position: 'absolute', bottom: 10, right: 12, backgroundColor: '#FF0000', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  ytBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tabBtn: { paddingVertical: 5, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: spacing.xs },
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  watchBtn: { backgroundColor: '#FF0000', borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center' },
  watchBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  closeBtn: { borderRadius: borderRadius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
});
