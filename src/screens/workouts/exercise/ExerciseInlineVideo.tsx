import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  /** Direct .mp4 / HLS URL served from our own CDN (set via EXPO_PUBLIC_MEDIA_URL). */
  videoUrl: string;
  /** Optional poster image shown before the video loads. */
  posterUrl?: string;
  /** Height in px (16:9 aspect is handled by the caller). */
  height: number;
  /** Fallback to render on player error (e.g. video missing). */
  onError?: () => void;
}

/**
 * Inline native video player for exercise demonstration videos.
 *
 * Uses expo-video (Expo SDK 54+). Autoplays when mounted, loops so a short
 * demo plays continuously, and respects system mute unless the user taps to
 * unmute by tapping the video.
 *
 * Videos are hosted on our own infrastructure (Yandex Object Storage — RF
 * jurisdiction, no dependency on YouTube/Rutube availability). That makes the
 * same build work identically in RuStore, Google Play and App Store.
 */
export const ExerciseInlineVideo: React.FC<Props> = ({ videoUrl, posterUrl, height, onError }) => {
  const { colors } = useThemeStore();

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // expo-video surfaces errors via the `statusChange` event; we subscribe and
  // bubble a single callback so the parent can swap to a YouTube/Rutube link.
  useEffect(() => {
    const sub = player.addListener('statusChange', (e) => {
      if (e.status === 'error') onError?.();
    });
    return () => sub.remove();
  }, [player, onError]);

  const toggleMute = () => { player.muted = !player.muted; };

  return (
    <View style={[styles.wrapper, { height, backgroundColor: colors.background }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <TouchableOpacity style={styles.muteBadge} onPress={toggleMute} activeOpacity={0.8}>
        <Text style={styles.muteIcon}>{player.muted ? '🔇' : '🔊'}</Text>
      </TouchableOpacity>
      {!player.playing && (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { width: '100%', overflow: 'hidden' },
  muteBadge: {
    position: 'absolute', bottom: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10,
  },
  muteIcon: { fontSize: 14 },
  loader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
