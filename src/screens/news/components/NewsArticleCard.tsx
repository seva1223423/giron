import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useThemeColors } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { NewsArticle } from '../../../types';

const CATEGORY_LABELS: Record<string, string> = {
  fitness: 'Фитнес', nutrition: 'Питание', sport: 'Спорт',
  health: 'Здоровье', science: 'Наука',
  russian: 'Россия', powerlifting: 'Силовые', records: 'Рекорды',
  championships: 'Чемпионаты', club: 'Клуб',
};

function formatArticleDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return 'Сейчас';
  if (diffHours < 24) return `${diffHours}ч`;
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function estimateReadingTime(article: NewsArticle): string {
  const text = (article.summary || '') + (article.content || '');
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} мин`;
}

interface Props {
  article: NewsArticle;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}

/**
 * News / feed article card — redesigned to match the Direction A post
 * card style (A_NewsV2):
 *   - 20pt border radius, 1pt hairline border on surface
 *   - Uppercase gold category chip top-left (plus "Сегодня · 3 мин"
 *     meta on the right)
 *   - h4 title (2 lines), body summary (2 lines, muted)
 *   - Action row at the bottom: heart + message + share glyphs on the
 *     left (currently only save is wired to real actions), bookmark on
 *     the right (filled when saved)
 *
 * Removes the redundant "Источник: Giron" badge that was cluttering
 * the old card — every article in the feed is already "our" feed.
 */
export const NewsArticleCard: React.FC<Props> = ({ article, isSaved, onPress, onToggleSave }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  const handleShare = async () => {
    try {
      haptic.selection();
      await Share.share({ message: `${article.title}\n\n${article.summary}\n\nGiron` });
    } catch {}
  };

  const primaryCategory = (article.category || [])[0];
  const categoryLabel = primaryCategory ? (CATEGORY_LABELS[primaryCategory] || primaryCategory) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={`Статья: ${article.title}`}
      accessibilityRole="button"
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {/* Meta row: gold category chip + date/reading pair */}
      <View style={styles.metaRow}>
        {categoryLabel && (
          <View
            style={[
              styles.categoryChip,
              { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                color: colors.primary,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {categoryLabel}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {formatArticleDate(article.publishedAt)}
          </Text>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
          <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {estimateReadingTime(article)}
          </Text>
        </View>
      </View>

      <Text
        style={[typography.h4, { color: colors.text, marginTop: spacing.md }]}
        numberOfLines={2}
      >
        {article.title}
      </Text>
      {article.summary ? (
        <Text
          style={[typography.small, { color: colors.textSecondary, marginTop: 6 }]}
          numberOfLines={2}
        >
          {article.summary}
        </Text>
      ) : null}

      {/* Action row — share (opens system share sheet) + bookmark. The
          heart/comment glyphs from the design are placeholders there —
          we drop them here since the feed doesn't have real engagement
          counts. */}
      <View style={styles.actionRow}>
        {article.content ? (
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>
            Читать →
          </Text>
        ) : <View />}
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Поделиться статьёй"
            accessibilityRole="button"
          >
            <Icon name="send" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { haptic.selection(); onToggleSave(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isSaved ? 'Убрать из сохранённого' : 'Сохранить статью'}
            accessibilityRole="button"
            accessibilityState={{ selected: isSaved }}
          >
            <Icon name="bookmark" size={18} color={isSaved ? colors.primary : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryChip: {
    flexShrink: 1,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
