import React, { useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Image,
  Dimensions, Linking, Alert, Animated,
} from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_H = Math.round((SCREEN_W * 9) / 16);

interface Props {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  youtubeId?: string;
  primaryMuscles: string[];
  muscleLabels: Record<string, string>;
  description?: string;
  instructions?: string[];
}

async function openYouTube(youtubeId?: string, exerciseName?: string) {
  try {
    const query = encodeURIComponent(`${exerciseName || ''} техника выполнения`);
    if (youtubeId) {
      // Try YouTube app first, then browser
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
  primaryMuscles, muscleLabels, description, instructions,
}) => {
  const { colors } = useThemeStore();
  const thumbUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg` : null;
  const fallbackUrl = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;

  // Pulse animation for play button
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [visible]);

  const slideAnim = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
    } else {
      slideAnim.setValue(600);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] }]}
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* YouTube thumbnail */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openYouTube(youtubeId, exerciseName)}
          style={styles.thumbnailWrapper}
        >
          {thumbUrl ? (
            <Image
              source={{ uri: thumbUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
              defaultSource={fallbackUrl ? { uri: fallbackUrl } : undefined}
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.placeholderSearch}>🔍</Text>
              <Text style={styles.placeholderText}>Поиск в YouTube</Text>
            </View>
          )}

          {/* Dark overlay */}
          <View style={styles.overlay} />

          {/* Muscle label */}
          <Text style={styles.muscleLabel}>
            {primaryMuscles.slice(0, 3).map((m) => muscleLabels[m] || m).join(' · ')}
          </Text>

          {/* Play button */}
          <Animated.View style={[styles.playWrapper, { transform: [{ scale: pulse }] }]}>
            <View style={styles.playCircle}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          </Animated.View>

          {/* YouTube badge */}
          <View style={styles.ytBadge}>
            <Text style={styles.ytBadgeText}>YouTube</Text>
          </View>
        </TouchableOpacity>

        {/* Exercise info */}
        <View style={styles.info}>
          <Text style={[typography.h4, { color: colors.text }]} numberOfLines={2}>{exerciseName}</Text>
          {description && (
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]} numberOfLines={3}>
              {description}
            </Text>
          )}

          {/* Instructions preview (first 2 steps) */}
          {instructions && instructions.length > 0 && (
            <View style={{ marginTop: spacing.md }}>
              {instructions.slice(0, 2).map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <View style={[styles.stepDot, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={[typography.small, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>{step}</Text>
                </View>
              ))}
              {instructions.length > 2 && (
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  +{instructions.length - 2} шагов техники...
                </Text>
              )}
            </View>
          )}
        </View>

        {/* CTA buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.watchBtn, { backgroundColor: '#FF0000' }]}
            onPress={() => openYouTube(youtubeId, exerciseName)}
            activeOpacity={0.85}
          >
            <Text style={styles.watchBtnText}>
              {youtubeId ? '▶ Открыть видео в YouTube' : '🔍 Найти в YouTube'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={onClose}>
            <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  thumbnailWrapper: {
    width: '100%',
    height: THUMB_H,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderSearch: { fontSize: 40, marginBottom: 8 },
  placeholderText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  muscleLabel: {
    position: 'absolute',
    top: 12,
    left: 14,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playWrapper: {
    position: 'absolute',
  },
  playCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF0000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  playIcon: { color: '#FFFFFF', fontSize: 24, marginLeft: 4 },
  ytBadge: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: '#FF0000',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ytBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  info: { padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  buttons: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  watchBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  watchBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  closeBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
