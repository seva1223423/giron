import { api } from './api';
import type { SupportTicket, SupportMessage, TicketCategory, TicketStatus, TicketPriority } from '../types';

export const supportService = {
  // ── User ──────────────────────────────────────────────────────────────────
  async getMyTickets(): Promise<SupportTicket[]> {
    const res = await api.get('/support/tickets');
    return res.data;
  },

  async getTicket(id: string): Promise<SupportTicket> {
    const res = await api.get(`/support/tickets/${id}`);
    return res.data;
  },

  async createTicket(data: {
    subject: string;
    category: TicketCategory;
    message: string;
  }): Promise<SupportTicket> {
    const res = await api.post('/support/tickets', data);
    return res.data;
  },

  async sendMessage(ticketId: string, content: string): Promise<SupportMessage> {
    const res = await api.post(`/support/tickets/${ticketId}/messages`, { content });
    return res.data;
  },

  async closeTicket(ticketId: string): Promise<SupportTicket> {
    const res = await api.patch(`/support/tickets/${ticketId}/close`);
    return res.data;
  },

  // ── Staff ─────────────────────────────────────────────────────────────────
  async getAllTickets(params?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToMe?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ tickets: SupportTicket[]; total: number; page: number; pages: number }> {
    const res = await api.get('/support/all', { params });
    return res.data;
  },

  async updateTicketStatus(ticketId: string, data: { status?: TicketStatus; priority?: TicketPriority }): Promise<SupportTicket> {
    const res = await api.patch(`/support/tickets/${ticketId}/status`, data);
    return res.data;
  },

  async assignTicket(ticketId: string, assignedToId: string | null): Promise<SupportTicket> {
    const res = await api.patch(`/support/tickets/${ticketId}/assign`, { assignedToId });
    return res.data;
  },
};
