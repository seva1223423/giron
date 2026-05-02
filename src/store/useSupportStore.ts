import { create } from 'zustand';
import { supportService } from '../services/supportService';
import type { SupportTicket, SupportMessage, TicketCategory } from '../types';
// Round 246: surface store-level errors to Sentry. Previously every
// catch block swallowed silently with just a Russian error string in
// state — operators had zero visibility into "Не удалось…" cascades.
import { reportError } from '../utils/errorReporter';

interface SupportState {
  tickets: SupportTicket[];
  activeTicket: SupportTicket | null;
  loading: boolean;
  sending: boolean;
  error: string | null;

  fetchMyTickets: () => Promise<void>;
  fetchTicket: (id: string) => Promise<void>;
  createTicket: (data: { subject: string; category: TicketCategory; message: string }) => Promise<SupportTicket>;
  sendMessage: (ticketId: string, content: string) => Promise<void>;
  closeTicket: (ticketId: string) => Promise<void>;
  clearActive: () => void;
  clearError: () => void;
  clearUserData: () => void;
}

export const useSupportStore = create<SupportState>((set, get) => ({
  tickets: [],
  activeTicket: null,
  loading: false,
  sending: false,
  error: null,

  fetchMyTickets: async () => {
    set({ loading: true, error: null });
    try {
      const tickets = await supportService.getMyTickets();
      set({ tickets, loading: false });
    } catch (e) {
      reportError(e instanceof Error ? e : new Error(String(e)), { screen: 'support-store', tags: { op: 'fetchMyTickets' } });
      set({ loading: false, error: 'Не удалось загрузить обращения' });
    }
  },

  fetchTicket: async (id) => {
    set({ loading: true, error: null });
    try {
      const ticket = await supportService.getTicket(id);
      set({ activeTicket: ticket, loading: false });
    } catch (e) {
      reportError(e instanceof Error ? e : new Error(String(e)), { screen: 'support-store', tags: { op: 'fetchTicket' } });
      set({ loading: false, error: 'Не удалось загрузить обращение' });
    }
  },

  createTicket: async (data) => {
    set({ sending: true, error: null });
    try {
      const ticket = await supportService.createTicket(data);
      set((s) => ({ tickets: [ticket, ...s.tickets], sending: false }));
      return ticket;
    } catch (e) {
      reportError(e instanceof Error ? e : new Error(String(e)), { screen: 'support-store', tags: { op: 'createTicket' } });
      set({ sending: false, error: 'Не удалось создать обращение' });
      throw new Error('Не удалось создать обращение');
    }
  },

  sendMessage: async (ticketId, content) => {
    set({ sending: true, error: null });
    try {
      const message = await supportService.sendMessage(ticketId, content);
      set((s) => {
        if (!s.activeTicket || s.activeTicket.id !== ticketId) return { sending: false };
        return {
          sending: false,
          activeTicket: {
            ...s.activeTicket,
            messages: [...s.activeTicket.messages, message],
          },
        };
      });
    } catch (e) {
      reportError(e instanceof Error ? e : new Error(String(e)), { screen: 'support-store', tags: { op: 'sendMessage' } });
      set({ sending: false, error: 'Не удалось отправить сообщение' });
    }
  },

  closeTicket: async (ticketId) => {
    set({ error: null });
    try {
      const updated = await supportService.closeTicket(ticketId);
      set((s) => ({
        tickets: s.tickets.map((t) => (t.id === ticketId ? updated : t)),
        activeTicket: s.activeTicket?.id === ticketId ? updated : s.activeTicket,
      }));
    } catch (e) {
      reportError(e instanceof Error ? e : new Error(String(e)), { screen: 'support-store', tags: { op: 'closeTicket' } });
      set({ error: 'Не удалось закрыть обращение' });
    }
  },

  clearActive: () => set({ activeTicket: null }),
  clearError: () => set({ error: null }),
  clearUserData: () => set({ tickets: [], activeTicket: null, error: null }),
}));
