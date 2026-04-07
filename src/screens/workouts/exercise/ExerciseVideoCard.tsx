import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, Alert } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  exerciseName: string;
  youtubeId?: string;
  primaryMuscles: string[];
  muscleLabels: Record<string, string>;
}

export const ExerciseVideoCard: React.FC<Props> = ({ exerciseName, youtubeId, primaryMuscles, muscleLabels }) => {
  const { colors } = useThemeStore();

  const handlePress = async () => {
    const videoUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;
    const appUrl = youtubeId ? `youtube://www.youtube.com/watch?v=${youtubeId}` : null;
    const query = encodeURIComponent(`${exerciseName} техника выполнения`);
    const searchWebUrl = `https://www.youtube.com/results?search_query=${query}`;
    const searchAppUrl = `youtube://results?search_query=${query}`;
    try {
      if (appUrl && videoUrl) {
        const canOpen = await Linking.canOpenURL(appUrl);
        await Linking.openURL(canOpen ? appUrl : videoUrl);
      } else {
        const canOpen = await Linking.canOpenURL(searchAppUrl);
        await Linking.openURL(canOpen ? searchAppUrl : searchWebUrl);
      }
    } catch {
      Linking.openURL(videoUrl || searchWebUrl);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.thumbnail}>
        {youtubeId ? (
          <Image source={{ uri: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : null}
        <View style={styles.overlay} />
        <Text style={styles.muscleText}>{primaryMuscles.map((m) => muscleLabels[m] || m).join(' · ')}</Text>
        <View style={styles.playBtn}>
          <View style={styles.playBtnInner}>
            <Text style={{ color: '#FFF', fontSize: 18, marginLeft: 3 }}>▶</Text>
          </View>
        </View>
        <View style={styles.youtubeBadge}>
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>▶ YouTube</Text>
        </View>
      </View>
      <View style={[styles.info, { backgroundColor: colors.surface }]}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>{exerciseName} — техника выполнения</Text>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>Нажми чтобы открыть в приложении YouTube</Text>
        </View>
        <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing.xl },
  thumbnail: { height: 160, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  muscleText: { position: 'absolute', top: 10, left: 12, color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  playBtnInner: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' },
  youtubeBadge: { position: 'absolute', bottom: 8, right: 10, backgroundColor: '#FF0000', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  info: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm },
});
