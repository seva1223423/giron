import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Animated as RNAnimated } from 'react-native';
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

const CATEGORIES: { key: NewsCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'fitness', label: 'Фитнес' },
  { key: 'nutrition', label: 'Питание' },
  { key: 'sport', label: 'Спорт' },
  { key: 'health', label: 'Здоровье' },
  { key: 'science', label: 'Наука' },
];

export const NewsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const [tab, setTab] = useState<'feed' | 'saved'>('feed');
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all'>('all');
  const [news, setNews] = useState<NewsArticle[]>(FALLBACK_NEWS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchNews = useCallback(async () => {
    try {
      const category = activeCategory === 'all' ? undefined : activeCategory;
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

  const filteredNews = useMemo(() => {
    let result = news;
    // Filter by tab
    if (tab === 'saved') {
      result = result.filter((n) => savedIds.has(n.id));
    }
    // Filter by category
    if (activeCategory !== 'all') {
      result = result.filter((n) => n.category?.includes(activeCategory as NewsCategory));
    }
    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (n) => (n.title ?? '').toLowerCase().includes(q) || (n.summary ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [news, tab, activeCategory, savedIds, searchQuery]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]} numberOfLines={1}>Новости</Text>
        <TouchableOpacity onPress={onFetchFreshNews} disabled={refreshing}>
          <Text style={[typography.small, { color: refreshing ? colors.textTertiary : colors.primary }]} numberOfLines={1}>{refreshing ? 'Обновление...' : '↻ Обновить'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabRow, { paddingHorizontal: spacing.xl }]}>
        <TouchableOpacity
          onPress={() => setTab('feed')}
          style={[styles.tabButton, { backgroundColor: tab === 'feed' ? colors.primary : colors.surface, borderRadius: borderRadius.md }]}
        >
          <Text style={[typography.smallMedium, { color: tab === 'feed' ? '#FFF' : colors.textSecondary, fontWeight: '600' }]}>Лента</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('saved')}
          style={[styles.tabButton, { backgroundColor: tab === 'saved' ? colors.primary : colors.surface, borderRadius: borderRadius.md }]}
        >
          <Text style={[typography.smallMedium, { color: tab === 'saved' ? '#FFF' : colors.textSecondary, fontWeight: '600' }]}>Сохранённое</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.textTertiary, fontSize: 14, marginRight: spacing.sm }}>◯</Text>
        <TextInput
          style={[typography.body, { flex: 1, color: colors.text, padding: 0 }]}
          placeholder="Поиск статей..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.body, { color: colors.textTertiary }]}>✕</Text>
          </TouchableOpacity>
        )}
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
            {tab !== 'saved' && (
              <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
                <Text style={[typography.captionMedium, { color: colors.accent }]}>РЕКОРД ДНЯ</Text>
                <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>Присед 350 кг — Андрей Маланичев</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>Абсолютный рекорд России в экипировочном пауэрлифтинге</Text>
              </Card>
            )}

            {filteredNews.length === 0 && tab === 'saved' && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔖</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>Пока нет сохранённых статей.{'\n'}Нажми 📌 на любой статье чтобы сохранить.</Text>
              </View>
            )}

            {filteredNews.length === 0 && tab === 'feed' && !loading && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>Нет новостей в этой категории</Text>
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
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tabButton: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  categories: { paddingHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.lg },
  categoryChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, borderWidth: 1 },
  newsList: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginHorizontal: spacing.xl, marginBottom: spacing.md },
});
