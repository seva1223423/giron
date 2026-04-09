import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { NewsArticle, NewsCategory } from '../../types';
import { newsService } from '../../services';
import { ArticleDetailModal, NewsArticleCard } from './components';
import { FALLBACK_NEWS } from './components/fallbackNews';

const CATEGORIES: { key: NewsCategory | 'all' | 'saved'; label: string }[] = [
  { key: 'all', label: 'Все' }, { key: 'saved', label: '🔖 Сохранённые' },
  { key: 'russian', label: 'Россия' }, { key: 'powerlifting', label: 'Силовые' },
  { key: 'records', label: 'Рекорды' }, { key: 'championships', label: 'Чемпионаты' },
  { key: 'club', label: 'Клуб' },
];

export const NewsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all' | 'saved'>('all');
  const [news, setNews] = useState<NewsArticle[]>(FALLBACK_NEWS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      const category = activeCategory === 'all' || activeCategory === 'saved' ? undefined : activeCategory;
      const articles = await newsService.getNews({ category });
      if (articles.length > 0) setNews(articles);
      try { const saved = await newsService.getSaved(); setSavedIds(new Set(saved.map((a) => a.id))); } catch {}
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const onRefresh = () => { setRefreshing(true); fetchNews(); };

  const onFetchFreshNews = async () => {
    setRefreshing(true);
    try { await newsService.triggerRefresh(); } catch {}
    await fetchNews();
  };

  const toggleSave = async (id: string) => {
    const wasSaved = savedIds.has(id);
    setSavedIds((prev) => { const next = new Set(prev); wasSaved ? next.delete(id) : next.add(id); return next; });
    try { await newsService.toggleSave(id); } catch {
      // Revert: restore previous state
      setSavedIds((prev) => { const next = new Set(prev); wasSaved ? next.add(id) : next.delete(id); return next; });
    }
  };

  const filteredNews = activeCategory === 'all' ? news
    : activeCategory === 'saved' ? news.filter((n) => savedIds.has(n.id))
    : news.filter((n) => n.category?.includes(activeCategory as NewsCategory));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Новости</Text>
        <TouchableOpacity onPress={onFetchFreshNews} disabled={refreshing}>
          <Text style={[typography.small, { color: refreshing ? colors.textTertiary : colors.primary }]}>{refreshing ? 'Обновление...' : '↻ Обновить'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity key={cat.key} onPress={() => setActiveCategory(cat.key)} style={[styles.categoryChip, { backgroundColor: activeCategory === cat.key ? colors.primary : colors.surface, borderColor: activeCategory === cat.key ? colors.primary : colors.border }]}>
            <Text style={[typography.smallMedium, { color: activeCategory === cat.key ? '#FFF' : colors.text }]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ArticleDetailModal
        article={selectedArticle}
        isSaved={selectedArticle ? savedIds.has(selectedArticle.id) : false}
        onClose={() => setSelectedArticle(null)}
        onToggleSave={toggleSave}
      />

      <ScrollView
        contentContainerStyle={styles.newsList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading && news.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.huge }} />
        ) : (
          <>
            {activeCategory !== 'saved' && (
              <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
                <Text style={[typography.captionMedium, { color: colors.accent }]}>РЕКОРД ДНЯ</Text>
                <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>Присед 350 кг — Андрей Маланичев</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>Абсолютный рекорд России в экипировочном пауэрлифтинге</Text>
              </Card>
            )}

            {filteredNews.length === 0 && activeCategory === 'saved' && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔖</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>Пока нет сохранённых статей.{'\n'}Нажми 📌 на любой статье чтобы сохранить.</Text>
              </View>
            )}

            {filteredNews.map((article) => (
              <NewsArticleCard
                key={article.id}
                article={article}
                isSaved={savedIds.has(article.id)}
                onPress={() => { haptic.selection(); setSelectedArticle(article); }}
                onToggleSave={() => toggleSave(article.id)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  categories: { paddingHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.lg },
  categoryChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, borderWidth: 1 },
  newsList: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
});
