import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Animated as RNAnimated } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useResponsive } from '../../hooks/useResponsive';
import { useThemeColors } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius, contentMaxWidth } from '../../theme/spacing';
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
  const r = useResponsive();
  const haptic = useHaptic();
  const colors = useThemeColors();
  const [tab, setTab] = useState<'feed' | 'saved'>('feed');
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all'>('all');
  const [news, setNews] = useState<NewsArticle[]>(FALLBACK_NEWS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fetchGenRef = useRef(0);

  const fetchNews = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      const category = activeCategory === 'all' ? undefined : activeCategory;
      const articles = await newsService.getNews({ category });
      if (gen !== fetchGenRef.current) return;
      if (articles.length > 0) { setNews(articles); setStale(false); }
      try { const saved = await newsService.getSaved(); setSavedIds(new Set(saved.map((a) => a.id))); } catch {}
    } catch { if (gen !== fetchGenRef.current) return; setStale(true); } finally {
      if (gen !== fetchGenRef.current) return;
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
      {/* Premium editorial header — "КОМЬЮНИТИ" eyebrow + large "Лента"
          display title on the left, search + refresh icon tiles on the
          right. Mirrors A_NewsV2's top block. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: spacing.xl, paddingTop: safeTop + spacing.md, paddingBottom: spacing.md }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text
            style={[typography.metaLabel, { color: colors.textTertiary, textTransform: 'uppercase' }]}
            numberOfLines={1}
          >
            Комьюнити
          </Text>
          <Text
            style={[typography.h2, { color: colors.text, marginTop: 2 }]}
            numberOfLines={1}
          >
            Лента
          </Text>
        </View>
        <TouchableOpacity
          onPress={onFetchFreshNews}
          disabled={refreshing}
          accessibilityLabel="Обновить ленту"
          accessibilityRole="button"
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: refreshing ? colors.textTertiary : colors.text, fontSize: 16 }}>
            ↻
          </Text>
        </TouchableOpacity>
      </View>

      {/* Feed / Saved tabs — active tile uses gold fill + dark text
          matching the primary-CTA contract in the design tokens. */}
      <View style={[styles.tabRow, { paddingHorizontal: spacing.xl }]}>
        <TouchableOpacity
          onPress={() => setTab('feed')}
          style={[styles.tabButton, { backgroundColor: tab === 'feed' ? colors.primary : colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: tab === 'feed' ? colors.primary : colors.border }]}
          accessibilityLabel="Вкладка: Лента"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'feed' }}
        >
          <Text style={[typography.smallMedium, { color: tab === 'feed' ? colors.textInverse : colors.textSecondary, fontWeight: '600' }]}>Лента</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('saved')}
          style={[styles.tabButton, { backgroundColor: tab === 'saved' ? colors.primary : colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: tab === 'saved' ? colors.primary : colors.border }]}
          accessibilityLabel="Вкладка: Сохранённое"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'saved' }}
        >
          <Text style={[typography.smallMedium, { color: tab === 'saved' ? colors.textInverse : colors.textSecondary, fontWeight: '600' }]}>Сохранённое</Text>
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

      {/* Category chips — active uses gold-fill + dark text (same
          primary-CTA color contract as the tab row above). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {CATEGORIES.map((cat) => {
          const active = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => setActiveCategory(cat.key)}
              accessibilityLabel={`Категория: ${cat.label}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: active ? colors.primary : 'transparent',
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  typography.smallMedium,
                  {
                    color: active ? colors.textInverse : colors.textSecondary,
                    fontWeight: '600',
                  },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ArticleDetailModal
        article={selectedArticle}
        isSaved={selectedArticle ? savedIds.has(selectedArticle.id) : false}
        onClose={() => setSelectedArticle(null)}
        onToggleSave={toggleSave}
      />

      <ScrollView
        contentContainerStyle={[styles.newsList, { width: '100%', maxWidth: r.pick(contentMaxWidth), alignSelf: 'center' }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {stale && tab === 'feed' && (
          <View style={{ backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginBottom: spacing.sm, borderRadius: 8 }}>
            <Text style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}>Нет подключения — показаны сохранённые новости</Text>
          </View>
        )}
        {loading && news.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.huge }} />
        ) : (
          <>
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
