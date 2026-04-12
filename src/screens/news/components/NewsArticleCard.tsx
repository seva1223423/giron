import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { NewsArticle } from '../../../types';

const CATEGORY_LABELS: Record<string, string> = {
  fitness: 'Фитнес', nutrition: 'Питание', sport: 'Спорт',
  health: 'Здоровье', science: 'Наука',
  russian: 'Россия', powerlifting: 'Силовые', records: 'Рекорды',
  championships: 'Чемпионаты', club: 'Клуб',
};

function formatArticleDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function estimateReadingTime(article: NewsArticle): string {
  const text = (article.summary || '') + (article.content || '');
  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} мин чтения`;
}

interface Props {
  article: NewsArticle;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}

export const NewsArticleCard: React.FC<Props> = ({ article, isSaved, onPress, onToggleSave }) => {
  const { colors } = useThemeStore();

  const handleShare = async () => {
    try {
      await Share.share({ message: `${article.title}\n\n${article.summary}\n\nIron Gym` });
    } catch {}
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.header}>
          <View style={styles.tags}>
            {(article.category || []).map((cat) => (
              <View key={cat} style={[styles.tag, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '35' }]}>
                <Text style={[typography.caption, { color: colors.primary }]}>{CATEGORY_LABELS[cat] || cat}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TouchableOpacity onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 18 }]}>↗</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onToggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 20 }}>{isSaved ? '🔖' : '📌'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.sm }]} numberOfLines={2}>{article.title}</Text>
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]} numberOfLines={2}>{article.summary}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
            <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>{formatArticleDate(article.publishedAt)}</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>·</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>{estimateReadingTime(article)}</Text>
          </View>
          {article.content ? <Text style={[typography.caption, { color: colors.primary }]}>Читать →</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
          <View style={[styles.sourceBadge, { backgroundColor: colors.accent + '12', borderWidth: 1, borderColor: colors.accent + '35' }]}>
            <Text style={[typography.caption, { color: colors.accent, fontSize: 10 }]}>Источник: Iron Gym</Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', flex: 1 },
  tag: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
  sourceBadge: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
});
