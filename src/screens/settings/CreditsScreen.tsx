import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors } from '../../store';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { VERIFIED_INLINE_VIDEO_IDS } from '../../config/store';
import manifest from '../../../assets/exercise-videos/videos-manifest.json';

type ManifestEntry = {
  id: string;
  title: string;
  license: string;
  artist: string;
  descriptionUrl: string;
};

// The manifest contains every clip the fetcher ever downloaded (including the
// off-topic ones that were rejected during QA). We only render entries whose
// IDs are in the verified whitelist — those are the 32 clips actually bundled
// into the app.
const VERIFIED_ENTRIES = Object.values(manifest as unknown as Record<string, ManifestEntry>)
  .filter((e) => VERIFIED_INLINE_VIDEO_IDS.has(e.id))
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * Credits / attribution screen for exercise demo videos.
 *
 * CC-BY and CC-BY-SA licenses require visible attribution when the work is
 * used publicly. This screen satisfies that by listing every bundled clip's
 * title, author, license, and source link, accessible from
 * Settings → Правовая информация → Авторы видео.
 */
export const CreditsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const colors = useThemeColors();

  // Map ids → human-readable exercise names for the left column.
  const exerciseNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ex of localExercises) map[ex.id] = ex.name;
    return map;
  }, []);

  const openSource = (url: string) => {
    Linking.openURL(url).catch(() => { /* best effort */ });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Назад">
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Авторы видео</Text>
        </View>
      </View>

      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 }]}>
        Демонстрационные видео упражнений в приложении взяты из открытой библиотеки
        <Text style={{ fontWeight: '700' }}> Wikimedia Commons</Text> под лицензиями
        Creative Commons (CC-BY / CC-BY-SA) и Public Domain. Ниже — полный список
        клипов с указанием авторов и ссылок на оригиналы.
      </Text>

      {VERIFIED_ENTRIES.map((entry) => (
        <TouchableOpacity
          key={entry.id}
          onPress={() => openSource(entry.descriptionUrl)}
          activeOpacity={0.7}
          style={[styles.row, { borderBottomColor: colors.divider }]}
          accessibilityRole="link"
          accessibilityLabel={`Открыть источник: ${entry.title}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]} numberOfLines={1}>
              {exerciseNames[entry.id] ?? entry.id}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={2}>
              {entry.title.replace(/^File:/, '').replace(/\.(webm|mp4|ogv)$/i, '')}
            </Text>
            <View style={styles.metaRow}>
              <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
                {entry.artist || 'Unknown'}
              </Text>
              <View style={[styles.licenseChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '35' }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>{entry.license}</Text>
              </View>
            </View>
          </View>
          <Text style={{ fontSize: 16, color: colors.textTertiary, marginLeft: spacing.sm }}>↗</Text>
        </TouchableOpacity>
      ))}

      <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.huge, lineHeight: 18 }]}>
        Всего {VERIFIED_ENTRIES.length} {' '}видео. Лицензии CC разрешают
        коммерческое использование при сохранении атрибуции.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: 4,
  },
  licenseChip: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: borderRadius.sm, borderWidth: 1,
  },
});
