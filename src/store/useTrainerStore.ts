import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trainerService } from '../services/trainerService';

export interface TrainerClient {
  id: string;
  name: string;
  age?: number;
  goal?: string;
  level?: string;
  lastVisit?: string;
  totalWorkouts?: number;
  assignedProgram?: string;
  notes?: string;
  phone?: string;
  emoji?: string;

  // Invite linkage (Product-01) — populated by the server when the client
  // accepts the trainer's invite code. `inviteCode` is nulled by the trainer
  // on disconnect; `acceptedAt` remains for audit trail until a new invite
  // overwrites it.
  inviteCode?: string | null;
  invitedAt?: string | null;   // ISO date
  acceptedAt?: string | null;  // ISO date — presence = linked-to-real-user
  clientUserId?: string | null;
}

export interface TrainerWorkoutSession {
  id: string;
  clientId: string;
  date: string; // YYYY-MM-DD
  name: string;
  durationMinutes: number;
  volumeKg?: number;
  notes?: string;
}

interface TrainerStore {
  clients: TrainerClient[];
  sessions: TrainerWorkoutSession[];
  isLoading: boolean;

  fetchClients: () => Promise<void>;
  addClient: (client: Omit<TrainerClient, 'id'>) => Promise<void>;
  updateClient: (id: string, data: Partial<TrainerClient>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  fetchSessions: (clientId: string) => Promise<void>;
  logWorkoutSession: (session: Omit<TrainerWorkoutSession, 'id'>) => Promise<void>;
  removeWorkoutSession: (id: string) => Promise<void>;
  getClientSessions: (clientId: string) => TrainerWorkoutSession[];

  // Invite linkage (Product-01). `generateInvite` / `disconnectLink` are
  // trainer-side actions; `acceptInvite` is called from the *client's*
  // account — it doesn't mutate this store's roster but does return the
  // trainerClientId for UI confirmation and observability.
  generateInvite: (clientId: string) => Promise<{ code: string } | null>;
  acceptInvite: (code: string) => Promise<{ trainerClientId: string; trainerId: string; displayName: string } | { error: string; code?: string }>;
  disconnectLink: (clientId: string) => Promise<void>;

  // Client-side: list of trainers the current user has accepted invites
  // from. `myTrainers` mirrors the server response of GET /my-trainers
  // and is repopulated by `fetchMyTrainers` + after a successful
  // `acceptInvite`.
  myTrainers: ClientTrainerLink[];
  fetchMyTrainers: () => Promise<void>;
  leaveTrainer: (trainerClientId: string) => Promise<void>;

  clearUserData: () => void;
}

export interface ClientTrainerLink {
  trainerClientId: string;
  acceptedAt: string | null;
  trainerId: string;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
}

export const useTrainerStore = create<TrainerStore>()(
  persist(
    (set, get) => ({
      clients: [],
      sessions: [],
      isLoading: false,
      myTrainers: [],

      fetchClients: async () => {
        set({ isLoading: true });
        try {
          const clients = await trainerService.getClients();
          set({ clients, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      addClient: async (data) => {
        // Random suffix — two rapid addClient calls in the same millisecond
        // would otherwise share an id, and a rollback on one would erase both.
        const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const tempClient: TrainerClient = { ...data, id: tempId };
        set((s) => ({ clients: [tempClient, ...s.clients] }));

        try {
          const serverClient = await trainerService.addClient(data);
          set((s) => ({
            clients: s.clients.map((c) => c.id === tempId ? serverClient : c),
          }));
        } catch {
          set((s) => ({ clients: s.clients.filter((c) => c.id !== tempId) }));
        }
      },

      updateClient: async (id, data) => {
        const prev = get().clients.find((c) => c.id === id);
        set((s) => ({
          clients: s.clients.map((c) => c.id === id ? { ...c, ...data } : c),
        }));

        try {
          await trainerService.updateClient(id, data);
        } catch {
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => c.id === id ? prev : c),
            }));
          }
        }
      },

      deleteClient: async (id) => {
        const removedClient = get().clients.find((c) => c.id === id);
        const removedSessions = get().sessions.filter((s) => s.clientId === id);
        set((s) => ({
          clients: s.clients.filter((c) => c.id !== id),
          sessions: s.sessions.filter((s) => s.clientId !== id),
        }));

        try {
          await trainerService.deleteClient(id);
        } catch (err: any) {
          // 404 = already deleted on server — treat as success, don't rollback
          if (err?.response?.status !== 404 && removedClient) {
            // Re-add only the removed client and sessions — restoring a snapshot would
            // erase concurrent changes made while this delete was in-flight
            set((s) => ({
              clients: [...s.clients, removedClient],
              sessions: [...s.sessions, ...removedSessions],
            }));
          }
        }
      },

      fetchSessions: async (clientId) => {
        try {
          const serverSessions = await trainerService.getSessions(clientId);
          // Replace all sessions for this client with server data
          set((s) => ({
            sessions: [
              ...s.sessions.filter((sess) => sess.clientId !== clientId),
              ...serverSessions,
            ],
          }));
        } catch {
          // Keep local sessions if server unreachable
        }
      },

      logWorkoutSession: async (data) => {
        // Random suffix — prevents id collision when two sessions are logged
        // within the same millisecond (same reason as addClient above).
        const tempId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const tempSession: TrainerWorkoutSession = { ...data, id: tempId };
        set((s) => ({ sessions: [tempSession, ...s.sessions] }));

        try {
          const { clientId, ...rest } = data;
          const serverSession = await trainerService.logSession(clientId, rest);
          // Replace temp with real server record
          set((s) => ({
            sessions: s.sessions.map((sess) => sess.id === tempId ? serverSession : sess),
          }));
          // Client totalWorkouts will resync on next fetchClients call
        } catch {
          // Remove only the temp session — restoring a snapshot would erase concurrent changes
          set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== tempId) }));
        }
      },

      removeWorkoutSession: async (id) => {
        const removed = get().sessions.find((s) => s.id === id);
        set((s) => ({ sessions: s.sessions.filter((s) => s.id !== id) }));

        try {
          await trainerService.deleteSession(id);
          // Re-fetch clients to get updated totalWorkouts
          const updatedClients = await trainerService.getClients();
          set({ clients: updatedClients });
        } catch (err: any) {
          // 404 = already deleted on server — treat as success, don't rollback
          if (err?.response?.status !== 404 && removed) {
            // Re-add only the removed session — restoring a snapshot would erase concurrent changes
            set((s) => ({ sessions: [...s.sessions, removed] }));
          }
        }
      },

      getClientSessions: (clientId) => {
        return get().sessions
          .filter((s) => s.clientId === clientId)
          .sort((a, b) => b.date.localeCompare(a.date));
      },

      generateInvite: async (clientId) => {
        try {
          const { code } = await trainerService.generateInvite(clientId);
          // Optimistically patch the local row so the trainer sees the code
          // immediately without a refetch. Server will eventually re-emit
          // the same value on next fetchClients.
          set((s) => ({
            clients: s.clients.map((c) =>
              c.id === clientId ? { ...c, inviteCode: code, invitedAt: new Date().toISOString() } : c
            ),
          }));
          return { code };
        } catch {
          return null;
        }
      },

      acceptInvite: async (code) => {
        try {
          const res = await trainerService.acceptInvite(code);
          // Refresh myTrainers in the background so the "My trainers" screen
          // reflects the new link without a manual pull-to-refresh. Not
          // awaited — UI can show success immediately, list will catch up.
          trainerService.getMyTrainers()
            .then((trainers) => set({ myTrainers: trainers }))
            .catch(() => {});
          return {
            trainerClientId: res.trainerClientId,
            trainerId: res.trainerId,
            displayName: res.displayName,
          };
        } catch (err: any) {
          // Surface server error codes to the UI so it can render a friendly
          // localized message (INVITE_NOT_FOUND vs INVITE_ALREADY_USED vs
          // SELF_INVITE vs ALREADY_CLIENT). Fallback to generic on timeout.
          const serverCode: string | undefined = err?.response?.data?.code;
          const serverError: string | undefined = err?.response?.data?.error;
          return {
            error: serverError ?? 'Не удалось принять приглашение',
            code: serverCode,
          };
        }
      },

      disconnectLink: async (clientId) => {
        const prev = get().clients.find((c) => c.id === clientId);
        // Optimistic clear so the trainer UI flips immediately.
        set((s) => ({
          clients: s.clients.map((c) =>
            c.id === clientId
              ? { ...c, inviteCode: null, invitedAt: null, acceptedAt: null, clientUserId: null }
              : c
          ),
        }));

        try {
          await trainerService.disconnectClient(clientId);
        } catch {
          // Roll back on server failure so the UI doesn't lie. If another
          // mutation landed concurrently, only this slot is rolled back —
          // we don't replay the entire array snapshot.
          if (prev) {
            set((s) => ({
              clients: s.clients.map((c) => (c.id === clientId ? prev : c)),
            }));
          }
        }
      },

      fetchMyTrainers: async () => {
        try {
          const trainers = await trainerService.getMyTrainers();
          set({ myTrainers: trainers });
        } catch {
          // Keep stale list rather than wiping — offline users still want
          // to see who their trainer is in the UI.
        }
      },

      leaveTrainer: async (trainerClientId) => {
        const prev = get().myTrainers;
        // Optimistic removal so the UI updates instantly.
        set((s) => ({
          myTrainers: s.myTrainers.filter((t) => t.trainerClientId !== trainerClientId),
        }));
        try {
          await trainerService.leaveTrainer(trainerClientId);
        } catch {
          // Restore the row on failure. Don't replay the entire array —
          // that would erase any concurrent fetchMyTrainers refresh.
          set((s) => {
            const lost = prev.find((t) => t.trainerClientId === trainerClientId);
            if (!lost) return s;
            // Insert back in original position based on prev order.
            const exists = s.myTrainers.some((t) => t.trainerClientId === trainerClientId);
            return exists ? s : { myTrainers: [...s.myTrainers, lost] };
          });
        }
      },

      clearUserData: () => set({ clients: [], sessions: [], isLoading: false, myTrainers: [] }),
    }),
    {
      name: 'giron-trainer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ clients: state.clients, sessions: state.sessions, myTrainers: state.myTrainers }),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
