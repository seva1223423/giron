import { api } from './api';
import type { AdminStats, AdminUserSummary, AdminUserDetail, AdminLog, UserRole, TicketStatus, TicketPriority, SupportTicket } from '../types';

export const adminService = {
  // ── Dashboard ─────────────────────────────────────────────────────────────
  async getStats(): Promise<AdminStats> {
    const res = await api.get('/admin/stats');
    return res.data;
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  async getUsers(params?: {
    search?: string;
    role?: string;
    page?: number;
    limit?: number;
    sort?: string;
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

  // ── Logs ──────────────────────────────────────────────────────────────────
  async getLogs(params?: { page?: number; limit?: number }): Promise<AdminLog[]> {
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
