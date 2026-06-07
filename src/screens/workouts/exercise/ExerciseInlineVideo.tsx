import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useThemeColors } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';

/**
 * Video + poster sources can be either:
 *   - a React Native module ID (`require('../assets/foo.mp4')`) for bundled assets
 *   - a remote URL string (legacy / fallback)
 * expo-av's Video and RN's <Image source={…} /> both accept either form.
 */
type MediaSource = number | string;

interface Props {
  /** Bundled asset module ID or a remote URL for the demo video. */
  videoSource: MediaSource;
  /** Optional poster shown before the first frame renders. */
  posterSource?: MediaSource;
  /** Height in px (16:9 aspect is handled by the caller). */
  height: number;
  /** Start muted (default true — autoplay only works muted on most platforms). */
  startMuted?: boolean;
  /** Hide the mute toggle (useful for very compact previews). */
  hideMuteButton?: boolean;
  /** Show native player controls (scrubber, fullscreen, mute). Useful in modal view. */
  nativeControls?: boolean;
  /** Pause playback from outside (e.g. when a modal overlays this card). */
  paused?: boolean;
  /** Fallback to render on player error (e.g. video missing). */
  onError?: () => void;
}

function toVideoSource(s: MediaSource) {
  return typeof s === 'number' ? s : { uri: s };
}
function toImageSource(s: MediaSource | undefined) {
  if (s === undefined) return undefined;
  return typeof s === 'number' ? s : { uri: s };
}

/**
 * Inline native video player for exercise demonstration videos.
 *
 * Uses expo-av (works on Expo SDK 54). API is declarative — we pass props
 * describing what should play and expo-av mounts/unmounts a native AVPlayer /
 * ExoPlayer under the hood. Unmounting the <Video/> releases the player, so
 * no manual release() is required; just let React unmount the component.
 *
 * Behavior:
 *   - Autoplays on mount (muted, looped by default).
 *   - Poster JPG overlay until the first frame actually renders.
 *   - Mute toggle is a dedicated corner button (not the whole surface) so the
 *     parent card can still receive taps for its own action (e.g. fullscreen).
 *   - `paused` prop lets the parent stop this instance when another player
 *     takes over — prevents double-decode when a modal is open over the card.
 *   - Surfaces load errors via onError so the parent can swap to a YouTube /
 *     Rutube link.
 */
export const ExerciseInlineVideo: React.FC<Props> = ({
  videoSource, posterSource, height, startMuted = true, hideMuteButton = false,
  nativeControls = false, paused = false, onError,
}) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const videoRef = useRef<Video | null>(null);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [muted, setMuted] = useState(startMuted);

  // Drive mute imperatively when the user taps the badge — keep local state
  // in sync for the icon.
  const toggleMute = () => {
    haptic.selection();
    const next = !muted;
    setMuted(next);
    videoRef.current?.setIsMutedAsync(next).catch(() => { /* ignore */ });
  };

  // Unload the underlying native player on unmount. expo-av keeps the AVPlayer
  // alive across react-navigation transitions otherwise, which means the last
  // exercise keeps decoding in the background as the user navigates.
  useEffect(() => {
    const ref = videoRef.current;
    return () => {
      ref?.unloadAsync().catch(() => { /* best effort */ });
    };
  }, []);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if ('error' in status && status.error) onError?.();
      return;
    }
    if (status.isPlaying && !hasStartedPlayback) setHasStartedPlayback(true);
  };

  return (
    <View style={[styles.wrapper, { height, backgroundColor: colors.background }]}>
      <Video
        ref={videoRef}
        source={toVideoSource(videoSource)}
        style={StyleSheet.absoluteFillObject}
        resizeMode={nativeControls ? ResizeMode.CONTAIN : ResizeMode.COVER}
        shouldPlay={!paused}
        isLooping
        isMuted={muted}
        useNativeControls={nativeControls}
        onPlaybackStatusUpdate={onStatus}
        onError={() => onError?.()}
      />

      {/* Poster overlay — fades away the moment the player starts rendering frames */}
      {!hasStartedPlayback && posterSource !== undefined && (
        <Image
          source={toImageSource(posterSource)!}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      )}

      {!hideMuteButton && (
        <TouchableOpacity
          style={styles.muteBadge}
          onPress={toggleMute}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Включить звук' : 'Выключить звук'}
        >
          <Text style={styles.muteIcon}>{muted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { width: '100%', overflow: 'hidden' },
  muteBadge: {
    position: 'absolute', bottom: 10, left: 12,
    minWidth: 36, minHeight: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  muteIcon: { fontSize: 16 },
});
