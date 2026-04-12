import { api } from './api';
import type { AdminStats, AdminUserSummary, AdminUserDetail, AdminLog, AdminAnalytics, UserRole, TicketStatus, TicketPriority, SupportTicket, Announcement, AnnouncementType } from '../types';

export const adminService = {
  // ── Dashboard ─────────────────────────────────────────────────────────────
  async getStats(): Promise<AdminStats> {
    const res = await api.get('/admin/stats');
    return res.data;
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  async getAnalytics(days?: number): Promise<AdminAnalytics> {
    const res = await api.get('/admin/analytics', { params: { days } });
    return res.data;
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  async getUsers(params?: {
    search?: string;
    role?: string;
    plan?: string;
    banned?: boolean;
    dormant?: boolean;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  }): Promise<{ users: AdminUserSummary[]; total: number; page: number; pages: number }> {
    const res = await api.get('/admin/users', { params });
    return res.data;
  },

  async getUser(id: string): Promise<AdminUserDetail> {
    const res = await api.get(`/admin/users/${id}`);
    return res.data;
  },

  async changeUserRole(userId: string, role: string): Promise<{ id: string; email: string; firstName: string; role: UserRole }> {
    const res = await api.patch(`/admin/users/${userId}/role`, { role });
    return res.data;
  },

  async changeUserSubscription(userId: string, data: {
    plan: 'free' | 'pro' | 'trainer' | 'club';
    status?: 'active' | 'cancelled' | 'expired';
    endDate?: string;
  }): Promise<unknown> {
    const res = await api.patch(`/admin/users/${userId}/subscription`, data);
    return res.data;
  },

  async banUser(userId: string, reason: string): Promise<unknown> {
    const res = await api.post(`/admin/users/${userId}/ban`, { reason });
    return res.data;
  },

  async unbanUser(userId: string): Promise<unknown> {
    const res = await api.post(`/admin/users/${userId}/unban`);
    return res.data;
  },

  async setAdminNote(userId: string, note: string): Promise<unknown> {
    const res = await api.patch(`/admin/users/${userId}/note`, { note });
    return res.data;
  },

  async deleteUser(userId: string): Promise<unknown> {
    const res = await api.delete(`/admin/users/${userId}`);
    return res.data;
  },

  async exportUsersCSV(params?: { role?: string; plan?: string; banned?: boolean }): Promise<string> {
    const res = await api.get('/admin/users/export', { params, responseType: 'text' });
    return res.data as string;
  },

  // ── Announcements ─────────────────────────────────────────────────────────
  /** Public endpoint — any authenticated user can call this */
  async getActiveAnnouncements(): Promise<Array<{ id: string; title: string; body: string; type: AnnouncementType; createdAt: string }>> {
    const res = await api.get('/admin/announcements/active');
    return res.data;
  },

  async getAnnouncements(): Promise<Announcement[]> {
    const res = await api.get('/admin/announcements');
    return res.data;
  },

  async createAnnouncement(data: {
    title: string; body: string; type: AnnouncementType; endsAt?: string;
  }): Promise<Announcement> {
    const res = await api.post('/admin/announcements', data);
    return res.data;
  },

  async updateAnnouncement(id: string, data: Partial<{ title: string; body: string; type: AnnouncementType; isActive: boolean; endsAt: string }>): Promise<Announcement> {
    const res = await api.patch(`/admin/announcements/${id}`, data);
    return res.data;
  },

  async deleteAnnouncement(id: string): Promise<void> {
    await api.delete(`/admin/announcements/${id}`);
  },

  // ── Logs ──────────────────────────────────────────────────────────────────
  async getLogs(params?: {
    page?: number;
    limit?: number;
    action?: string;
    adminId?: string;
  }): Promise<{ logs: AdminLog[]; total: number; page: number; pages: number }> {
    const res = await api.get('/admin/logs', { params });
    return res.data;
  },

  // ── Support (staff) ───────────────────────────────────────────────────────
  async getSupportTickets(params?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToMe?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ tickets: SupportTicket[]; total: number; page: number; pages: number }> {
    const res = await api.get('/admin/support', { params });
    return res.data;
  },

  async getSupportCounts(): Promise<Record<TicketStatus, number>> {
    const res = await api.get('/admin/support/counts');
    return res.data;
  },
};
