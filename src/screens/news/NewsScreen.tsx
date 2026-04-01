import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useThemeStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NewsArticle, NewsCategory } from '../../types';
import { newsService, getApiError } from '../../services';

const CATEGORIES: { key: NewsCategory | 'all' | 'saved'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'saved', label: '🔖 Сохранённые' },
  { key: 'russian', label: 'Россия' },
  { key: 'powerlifting', label: 'Силовые' },
  { key: 'records', label: 'Рекорды' },
  { key: 'championships', label: 'Чемпионаты' },
  { key: 'club', label: 'Клуб' },
];

// Fallback data when server is unavailable
const FALLBACK_NEWS: NewsArticle[] = [
  {
    id: '1',
    title: 'Юрий Белкин установил новый мировой рекорд в становой тяге',
    summary: 'На чемпионате WRPF Юрий Белкин поднял 440 кг в категории до 110 кг, побив свой прежний рекорд.',
    content: '',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-30T10:00:00Z',
    isSaved: false,
  },
  {
    id: '2',
    title: 'Рекорд дня: Жим лёжа 200 кг в категории 82.5 кг',
    summary: 'Российский атлет Дмитрий Иноземцев выжал 200 кг на соревнованиях IPF в Москве.',
    content: '',
    category: ['russian', 'records'],
    publishedAt: '2026-03-29T14:00:00Z',
    isSaved: false,
  },
  {
    id: '3',
    title: 'Чемпионат России по пауэрлифтингу 2026: итоги',
    summary: 'Подводим итоги главного национального турнира — 12 новых рекордов страны.',
    content: '',
    category: ['russian', 'championships', 'powerlifting'],
    publishedAt: '2026-03-28T09:00:00Z',
    isSaved: false,
  },
  {
    id: '4',
    title: '5 научно обоснованных способов ускорить восстановление',
    summary: 'Разбираем методы восстановления, подтверждённые исследованиями: сон, питание, активное восстановление.',
    content: '',
    category: ['russian'],
    publishedAt: '2026-03-27T12:00:00Z',
    isSaved: false,
  },
  {
    id: '5',
    title: 'Как правильно делать присед: разбор техники',
    summary: 'Детальный разбор биомеханики приседа со штангой от тренера сборной России.',
    content: '',
    category: ['powerlifting'],
    publishedAt: '2026-03-26T08:00:00Z',
    isSaved: false,
  },
];

export const NewsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all' | 'saved'>('all');
  const [news, setNews] = useState<NewsArticle[]>(FALLBACK_NEWS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = useCallback(async () => {
    try {
      const category = activeCategory === 'all' || activeCategory === 'saved' ? undefined : activeCategory;
      const articles = await newsService.getNews({ category });
      if (articles.length > 0) {
        setNews(articles);
      }
      // Load saved articles
      try {
        const saved = await newsService.getSaved();
        setSavedIds(new Set(saved.map((a) => a.id)));
      } catch {}
    } catch {
      // Keep fallback data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNews();
  };

  const onFetchFreshNews = async () => {
    setRefreshing(true);
    try {
      await newsService.triggerRefresh();
    } catch {
      // ignore — server will have tried its best
    }
    await fetchNews();
  };

  const filteredNews = activeCategory === 'all'
    ? news
    : activeCategory === 'saved'
      ? news.filter((n) => savedIds.has(n.id))
      : news.filter((n) => n.category?.includes(activeCategory as NewsCategory));

  const toggleSave = async (id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await newsService.toggleSave(id);
    } catch {
      // Revert on error
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Новости</Text>
        <TouchableOpacity onPress={onFetchFreshNews} disabled={refreshing}>
          <Text style={[typography.small, { color: refreshing ? colors.textTertiary : colors.primary }]}>
            {refreshing ? 'Обновление...' : '↻ Обновить'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            onPress={() => setActiveCategory(cat.key)}
            style={[
              styles.categoryChip,
              {
                backgroundColor: activeCategory === cat.key ? colors.primary : colors.surface,
                borderColor: activeCategory === cat.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                typography.smallMedium,
                { color: activeCategory === cat.key ? '#FFF' : colors.text },
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* News list */}
      <ScrollView
        contentContainerStyle={styles.newsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading && news.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.huge }} />
        ) : (
          <>
            {/* Record of the day */}
            {activeCategory !== 'saved' && <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
              <Text style={[typography.captionMedium, { color: colors.accent }]}>РЕКОРД ДНЯ</Text>
              <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
                Присед 350 кг — Андрей Маланичев
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Абсолютный рекорд России в экипировочном пауэрлифтинге
              </Text>
            </Card>

            {filteredNews.length === 0 && activeCategory === 'saved' && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔖</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Пока нет сохранённых статей.{'\n'}Нажми 📌 на любой статье чтобы сохранить.
                </Text>
              </View>
            )}

            {filteredNews.map((article) => (
              <Card key={article.id} style={{ marginBottom: spacing.md }}>
                <View style={styles.articleHeader}>
                  <View style={styles.categoryTags}>
                    {(article.category || []).map((cat) => (
                      <View
                        key={cat}
                        style={[styles.tag, { backgroundColor: colors.primary + '15' }]}
                      >
                        <Text style={[typography.caption, { color: colors.primary }]}>
                          {CATEGORIES.find((c) => c.key === cat)?.label || cat}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity onPress={() => toggleSave(article.id)}>
                    <Text style={{ fontSize: 20 }}>
                      {savedIds.has(article.id) ? '🔖' : '📌'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[typography.h4, { color: colors.text, marginTop: spacing.sm }]}>
                  {article.title}
                </Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                  {article.summary}
                </Text>
                <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.md }]}>
                  {formatDate(article.publishedAt)}
                </Text>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  categories: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  newsList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.huge,
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryTags: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  tag: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
});
