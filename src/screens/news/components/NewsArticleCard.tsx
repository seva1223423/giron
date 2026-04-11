import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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

interface Props {
  article: NewsArticle;
  isSaved: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}

export const NewsArticleCard: React.FC<Props> = ({ article, isSaved, onPress, onToggleSave }) => {
  const { colors } = useThemeStore();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={styles.header}>
          <View style={styles.tags}>
            {(article.category || []).map((cat) => (
              <View key={cat} style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[typography.caption, { color: colors.primary }]}>{CATEGORY_LABELS[cat] || cat}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={onToggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 20 }}>{isSaved ? '🔖' : '📌'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.sm }]}>{article.title}</Text>
        <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]} numberOfLines={2}>{article.summary}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
          <Text style={[typography.caption, { color: colors.textTertiary }]}>{formatArticleDate(article.publishedAt)}</Text>
          {article.content ? <Text style={[typography.caption, { color: colors.primary }]}>Читать →</Text> : null}
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', flex: 1 },
  tag: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
});
