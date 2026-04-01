import { api } from './api';
import { NewsArticle } from '../types';

export const newsService = {
  async getNews(params?: { category?: string; limit?: number; offset?: number }): Promise<NewsArticle[]> {
    const { data } = await api.get('/news', { params });
    return data;
  },

  async toggleSave(articleId: string): Promise<{ saved: boolean }> {
    const { data } = await api.post(`/news/${articleId}/save`);
    return data;
  },

  async getSaved(): Promise<NewsArticle[]> {
    const { data } = await api.get('/news/saved');
    return data;
  },

  async triggerRefresh(): Promise<{ added: number; skipped: number }> {
    const { data } = await api.post('/news/refresh');
    return data;
  },
};
