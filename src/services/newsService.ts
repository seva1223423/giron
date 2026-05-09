import { api } from './api';
import { NewsArticle, NewsCategory } from '../types';

/**
 * Server-side schema names the categories array `categories` (plural,
 * matches the Prisma column). The client `NewsArticle` type, on the
 * other hand, uses `category: NewsCategory[]` (singular). The mismatch
 * was silent: server articles arrived with `categories: [...]`, the
 * filter code in NewsScreen and the chip renderers in NewsArticleCard /
 * ArticleDetailModal all read `article.category`, got `undefined`, and
 * either filtered everything out or rendered no category chip.
 *
 * Fix at the service boundary — map once here so every downstream
 * consumer keeps using `article.category` like the type promises.
 */
function normalizeArticle(raw: any): NewsArticle {
  if (raw && Array.isArray(raw.categories) && raw.category === undefined) {
    return { ...raw, category: raw.categories as NewsCategory[] };
  }
  return raw as NewsArticle;
}

export const newsService = {
  async getNews(params?: { category?: string; limit?: number; offset?: number }): Promise<NewsArticle[]> {
    const { data } = await api.get('/news', { params });
    return Array.isArray(data) ? data.map(normalizeArticle) : data;
  },

  async toggleSave(articleId: string): Promise<{ saved: boolean }> {
    const { data } = await api.post(`/news/${articleId}/save`);
    return data;
  },

  async getSaved(): Promise<NewsArticle[]> {
    const { data } = await api.get('/news/saved');
    return Array.isArray(data) ? data.map(normalizeArticle) : data;
  },

  async triggerRefresh(): Promise<{ added: number; skipped: number }> {
    const { data } = await api.post('/news/refresh');
    return data;
  },
};
