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
    locked?: boolean;
    dormant?: boolean;
    subExpiringSoon?: boolean;
    recentlyActive?: boolean;
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

  async unlockUser(userId: string): Promise<unknown> {
    const res = await api.post(`/admin/users/${userId}/unlock`);
    return res.data;
  },

  async forceVerifyEmail(userId: string): Promise<unknown> {
    const res = await api.post(`/admin/users/${userId}/force-verify-email`);
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

  async updateAnnouncement(id: string, data: Partial<{ title: string; body: string; type: AnnouncementType; isActive: boolean; endsAt: string; targetRole: string | null }>): Promise<Announcement> {
    const res = await api.patch(`/admin/announcements/${id}`, data);
    return res.data;
  },

  async deleteAnnouncement(id: string): Promise<void> {
    await api.delete(`/admin/announcements/${id}`);
  },

  async duplicateAnnouncement(id: string): Promise<Announcement> {
    const res = await api.post(`/admin/announcements/${id}/duplicate`);
    return res.data;
  },

  async getAnnouncementAudience(targetRole?: string): Promise<{ count: number }> {
    const res = await api.get('/admin/announcements/preview', { params: { targetRole: targetRole || undefined } });
    return res.data;
  },

  // ── Logs ──────────────────────────────────────────────────────────────────
  async getLogs(params?: {
    page?: number;
    limit?: number;
    action?: string;
    adminId?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<{ logs: AdminLog[]; total: number; page: number; pages: number }> {
    const res = await api.get('/admin/logs', { params });
    return res.data;
  },

  // ── Support (staff) ───────────────────────────────────────────────────────
  async getSupportTickets(params?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToMe?: boolean;
    search?: string;
    sort?: 'priority' | 'oldest' | 'newest' | 'created_desc';
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

  async getSupportMetrics(): Promise<{
    resolvedToday: number;
    openCount: number;
    unassigned: number;
    avgResponseHours: number | null;
    categoryBreakdown: Record<string, number>;
  }> {
    const res = await api.get('/admin/support/metrics');
    return res.data;
  },

  async addInternalNote(ticketId: string, content: string): Promise<unknown> {
    const res = await api.post(`/admin/support/${ticketId}/note`, { content });
    return res.data;
  },

  async exportTicketsCSV(): Promise<string> {
    const res = await api.get('/admin/support/export', { responseType: 'text' });
    return res.data as string;
  },

  async exportAnalyticsCSV(days?: number): Promise<string> {
    const res = await api.get('/admin/analytics/export', { params: { days }, responseType: 'text' });
    return res.data as string;
  },

  async exportLogsCSV(params?: { action?: string; adminId?: string; from?: string; to?: string }): Promise<string> {
    const res = await api.get('/admin/logs/export', { params, responseType: 'text' });
    return res.data as string;
  },

  async getCohorts(): Promise<Array<{ week: string; signups: number; activeThisWeek: number; retentionPct: number }>> {
    const res = await api.get('/admin/analytics/cohorts');
    return res.data;
  },

  async getSubscriptionTimeline(days?: number): Promise<{ timeline: Array<{ date: string; pro: number; trainer: number; club: number; total: number }>; totalNew: number; period: number }> {
    const res = await api.get('/admin/analytics/subscriptions', { params: { days } });
    return res.data;
  },

  async getSegments(): Promise<Array<{ plan: string; userCount: number; workouts30d: number; ai30d: number; activeLastWeek: number; avgWorkoutsPerUser: number; avgAiPerUser: number; activeRate: number }>> {
    const res = await api.get('/admin/analytics/segments');
    return res.data;
  },

  async getSubscriptionForecast(): Promise<Array<{ weekStart: string; weekEnd: string; count: number; revenue: number }>> {
    const res = await api.get('/admin/subscriptions/forecast');
    return res.data;
  },

  async getChurnRiskUsers(): Promise<Array<{ id: string; firstName: string; lastName?: string | null; email: string; plan: string; totalWorkouts: number; daysSinceWorkout: number | null; daysUntilExpiry: number | null; riskScore: number }>> {
    const res = await api.get('/admin/users/churn-risk');
    return res.data;
  },

  async getTopRevenueUsers(): Promise<Array<{ id: string; firstName: string; lastName?: string | null; email: string; plan: string; revenue: number; workouts: number; aiMessages: number; endDate?: string | null }>> {
    const res = await api.get('/admin/users/top-revenue');
    return res.data;
  },

  async getDailyReport(date?: string): Promise<{ report: string; date: string; metrics: Record<string, number> }> {
    const res = await api.get('/admin/report/daily', { params: { date } });
    return res.data;
  },

  async sendMessageToUser(userId: string, subject: string, message: string): Promise<unknown> {
    const res = await api.post(`/admin/users/${userId}/message`, { subject, message });
    return res.data;
  },

  async massMessage(userIds: string[], subject: string, message: string): Promise<{ sent: number; failed: number; total: number }> {
    const res = await api.post('/admin/mass-message', { userIds, subject, message });
    return res.data;
  },

  async getActivityFeed(): Promise<Array<{ id: string; type: 'workout' | 'signup' | 'ai' | 'cardio'; label: string; userId?: string; userName?: string; date: string }>> {
    const res = await api.get('/admin/activity-feed');
    return res.data;
  },

  async getStaff(): Promise<Array<{ id: string; firstName: string; lastName?: string | null; email: string; role: string }>> {
    const res = await api.get('/admin/staff');
    return res.data;
  },

  async assignTicket(ticketId: string, assignedToId: string | null): Promise<unknown> {
    const res = await api.patch(`/admin/support/${ticketId}/assign`, { assignedToId });
    return res.data;
  },

  async moderationSearch(query: string): Promise<{
    keyword: string;
    ai: Array<{ id: string; snippet: string; createdAt: string; user: { id: string; firstName: string; lastName?: string | null; email: string } }>;
    tickets: Array<{ id: string; subject: string; status: string; createdAt: string; user: { id: string; firstName: string; lastName?: string | null; email: string } }>;
  }> {
    const res = await api.get('/admin/moderation/search', { params: { q: query } });
    return res.data;
  },

  async broadcastToSegment(plan: string, subject: string, message: string, expiringSoonOnly?: boolean): Promise<{ sent: number; failed: number; total: number }> {
    const res = await api.post('/admin/subscriptions/broadcast', { plan, subject, message, expiringSoonOnly });
    return res.data;
  },

  async getSubscriptions(params?: {
    plan?: string;
    status?: string;
    expiringSoon?: boolean;
    page?: number;
    limit?: number;
    sort?: 'endDate' | 'createdAt' | 'plan';
    order?: 'asc' | 'desc';
  }): Promise<{ subscriptions: Array<{ id: string; plan: string; status: string; endDate: string | null; createdAt: string; user: { id: string; firstName: string; lastName?: string | null; email: string; isBanned: boolean } }>; total: number; page: number; pages: number }> {
    const res = await api.get('/admin/subscriptions', { params: { ...params, expiringSoon: params?.expiringSoon ? 'true' : undefined } });
    return res.data;
  },
};
