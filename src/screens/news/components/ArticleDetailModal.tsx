import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Share, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { NewsArticle } from '../../../types';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Все', saved: 'Сохранённые',
  fitness: 'Фитнес', nutrition: 'Питание', sport: 'Спорт',
  health: 'Здоровье', science: 'Наука',
  russian: 'Россия', powerlifting: 'Силовые',
  records: 'Рекорды', championships: 'Чемпионаты', club: 'Клуб',
};

function formatArticleDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface Props {
  article: NewsArticle | null;
  isSaved: boolean;
  onClose: () => void;
  onToggleSave: (id: string) => void;
}

export const ArticleDetailModal: React.FC<Props> = ({ article, isSaved, onClose, onToggleSave }) => {
  const { colors } = useThemeStore();

  const handleShare = async () => {
    if (!article) return;
    try {
      await Share.share({ message: `${article.title}\n\n${article.summary}\n\nIron Gym — лучшее фитнес-приложение для зала` });
    } catch {}
  };

  return (
    <Modal visible={article !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[typography.body, { color: colors.primary }]}>✕ Закрыть</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => article && onToggleSave(article.id)}>
                <Text style={{ fontSize: 22 }}>{isSaved ? '🔖' : '📌'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare}>
                <Text style={[typography.body, { color: colors.primary }]}>Поделиться</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {article && (
              <>
                <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.sm }}>
                  {(article.category || []).map((cat) => (
                    <View key={cat} style={[styles.tag, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '35' }]}>
                      <Text style={[typography.caption, { color: colors.primary }]}>{CATEGORY_LABELS[cat] || cat}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>{article.title}</Text>
                <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.lg }]}>{formatArticleDate(article.publishedAt)}</Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 22 }]}>{article.summary}</Text>
                {article.content ? (
                  <Text style={[typography.body, { color: colors.text, lineHeight: 24, marginBottom: spacing.xl }]}>{article.content}</Text>
                ) : (
                  <View style={[styles.tag, { backgroundColor: colors.surface, alignSelf: 'flex-start', paddingVertical: spacing.sm, marginBottom: spacing.xl }]}>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>Полный текст скоро появится</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48, maxHeight: '85%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  tag: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
});
