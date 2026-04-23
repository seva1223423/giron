import { api } from './api';
import type { TrainerClient, TrainerWorkoutSession } from '../store/useTrainerStore';

export const trainerService = {
  // ── Clients ───────────────────────────────────────────────────────────────
  async getClients(): Promise<TrainerClient[]> {
    const { data } = await api.get('/trainer/clients');
    return data;
  },

  async addClient(params: Omit<TrainerClient, 'id'>): Promise<TrainerClient> {
    const { data } = await api.post('/trainer/clients', params);
    return data;
  },

  async updateClient(id: string, params: Partial<TrainerClient>): Promise<TrainerClient> {
    const { data } = await api.patch(`/trainer/clients/${id}`, params);
    return data;
  },

  async deleteClient(id: string): Promise<void> {
    await api.delete(`/trainer/clients/${id}`);
  },

  // ── Sessions ──────────────────────────────────────────────────────────────
  async getSessions(clientId: string): Promise<TrainerWorkoutSession[]> {
    const { data } = await api.get(`/trainer/sessions/${clientId}`);
    return data.map((s: any) => ({
      id: s.id,
      clientId: s.clientId,
      date: s.date,
      name: s.name,
      durationMinutes: s.durationMinutes,
      volumeKg: s.volumeKg ?? undefined,
      notes: s.notes ?? undefined,
    }));
  },

  async logSession(clientId: string, params: Omit<TrainerWorkoutSession, 'id' | 'clientId'>): Promise<TrainerWorkoutSession> {
    const { data } = await api.post(`/trainer/sessions/${clientId}`, params);
    return {
      id: data.id,
      clientId: data.clientId,
      date: data.date,
      name: data.name,
      durationMinutes: data.durationMinutes,
      volumeKg: data.volumeKg ?? undefined,
      notes: data.notes ?? undefined,
    };
  },

  async deleteSession(id: string): Promise<void> {
    await api.delete(`/trainer/sessions/${id}`);
  },

  // ── Invite linkage (Product-01) ───────────────────────────────────────────
  // B2B Dashboard Phase 1 — trainer → real user bridge. See
  // server/src/routes/trainer.ts for the error-code taxonomy.

  /** Generate a 10-char invite code for this roster slot. Trainer shares it
   *  out-of-band (Telegram, SMS) and the client pastes it in their app. */
  async generateInvite(clientId: string): Promise<{ code: string }> {
    const { data } = await api.post(`/trainer/clients/${clientId}/invite`);
    return { code: data.code };
  },

  /** Accept an invite code as the current authenticated user. Links the
   *  caller to the trainer's roster slot. Works for any authenticated user,
   *  not gated on TRAINER role. */
  async acceptInvite(code: string): Promise<{
    success: boolean;
    trainerClientId: string;
    trainerId: string;
    displayName: string;
  }> {
    const { data } = await api.post('/trainer/accept-invite', { code });
    return data;
  },

  /** Disconnect a linked client. Row stays (preserves notes / sessions
   *  history) but clientUserId is cleared so a new invite can be issued. */
  async disconnectClient(clientId: string): Promise<void> {
    await api.delete(`/trainer/clients/${clientId}/link`);
  },
};
