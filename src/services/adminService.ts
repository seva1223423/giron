import { api } from './api';
import type { AdminStats, AdminUserSummary, AdminUserDetail, AdminLog, AdminAnalytics, UserRole, TicketStatus, TicketPriority, SupportTicket, Announcement, AnnouncementType } from '../types';

/**
 * Step-up re-auth credentials. The server requires these on financial /
 * destructive admin actions (subscription change, role change, ban,
 * delete, force-logout, force-disable-2fa) per the 2026-04 security
 * audit (HIGH-11). The client collects them via `useAdminStepUp` and
 * passes them as the second arg to the relevant adminService methods.
 */
export interface AdminStepUpCreds {
  adminPassword: string;
  adminTotpCode?: string;
}

/**
 * Response shape for GET /admin/metrics/key. Each block contains both raw
 * numbers and a derived `isHealthy` flag so the dashboard can colour-code
 * cards without re-implementing the threshold logic on the client. The
 * thresholds live server-side (single source of truth) and ride along on
 * each response so the UI can show "healthy <N>" labels.
 */
export interface KeyMetrics {
  generatedAt: string;
  /** Window the metrics cover (7/14/30/60/90). Set by the `?days=` query
   *  parameter on the request; defaults to 30 when omitted. */
  windowDays?: number;
  payingUsers: {
    current: number;
    thirtyDaysAgo: number;
    /** % change from 30 days ago, null when prior cohort was 0 (avoid /0). */
    deltaPct: number | null;
  };
  monthlyChurn: {
    churnedLast30: number;
    avgPaying: number;
    churnPct: number;
    healthyThreshold: number;
    isHealthy: boolean;
  };
  arpu: {
    rub: number;
    sampleSize: number;
    totalMrrRub: number;
    healthyThreshold: number;
    isHealthy: boolean;
  };
  activation: {
    cohortSize: number;
    activated24h: number;
    activationRatePct: number;
    medianTtfMinutes: number | null;
    healthyThreshold: number;
    isHealthy: boolean;
  };
  funnel: {
    signups: number;
    profiled: number;
    firstWorkout: number;
    firstChat: number;
    paid: number;
    signupToProfiledPct: number;
    profiledToFirstChatPct: number;
    firstChatToPaidPct: number;
    signupToPaidPct: number;
  };
  previous30d: {
    payingUsers: number;
    signups: number;
  };
  /**
   * Step-by-step drop-off in the 5-step onboarding flow (signup cohort
   * filtered by `windowDays`). Each `reachedStepN` counts users whose
   * onboardingStepLog has a timestamp for that step (first-touch only,
   * idempotent on retry). `completed` uses the canonical
   * onboardingCompletedAt flag rather than parsing the JSON for step 4.
   */
  onboardingFunnel?: {
    cohortSize: number;
    reachedStep0: number;
    reachedStep1: number;
    reachedStep2: number;
    reachedStep3: number;
    reachedStep4: number;
    completed: number;
    completionRatePct: number;
  };
}

/**
 * Response shape for GET /admin/cron-health — in-memory ledger of cron
 * job liveness. Records reset on Render dyno restart (which happens
 * every few hours on free tier), so an absence here is normal after
 * deploy — the cron just hasn't fired yet.
 */
export interface CronHealthRecord {
  id: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastDurationMs: number | null;
  successCount: number;
  errorCount: number;
  registeredAt: string;
}

export interface CronHealthResponse {
  cronJobs: CronHealthRecord[];
  now: string;
}

/**
 * Response shape for GET /admin/me — founder self-status. Bundles the
 * answers to the questions sevka asks during a session: did push fire,
 * did the activation email fire, what's my subscription state, when was
 * my last AI msg, etc. Uncached so the data is real-time.
 */
export interface AdminMe {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    createdAt: string;
    isBanned: boolean;
    lockedUntil: string | null;
    totpEnabled: boolean;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
  activation: {
    firstChatAt: string | null;
    daysSinceSignup: number | null;
    daysSinceLastActive: number | null;
    activated: boolean;
    pushFired: boolean;
    emailFired: boolean;
  };
  reactivation: {
    d7Fired: boolean;
    d14Fired: boolean;
    d30Fired: boolean;
  };
  /** Onboarding telemetry — null fields on accounts that pre-date the
   *  step-tracking endpoint (created before 2026-04-28). */
  onboarding?: {
    completed: boolean;
    completedAt: string | null;
    maxStepReached: number | null;
    stepLog: Record<string, string>;
  };
  pushTokens: {
    count: number;
    latest: { id: string; createdAt: string; updatedAt: string } | null;
  };
  lastChatAt: string | null;
  lastWorkoutAt: string | null;
  lastWorkoutVolume: number | null;
  subscription: {
    plan: string;
    status: string;
    endDate: string | null;
    renewalNoticeSentAt: string | null;
  };
  activeSessionCount: number;
  now: string;
}

export const adminService = {
  // ── Dashboard ─────────────────────────────────────────────────────────────
  async getStats(): Promise<AdminStats> {
    const res = await api.get('/admin/stats');
    return res.data;
  },

  /**
   * GET /admin/me — current admin's self-status. Real-time (uncached) so
   * the dashboard reflects whatever just changed (push token registered,
   * activation email fired, etc.). Used by AdminDashboardScreen's "Your
   * account" panel.
   */
  async getMe(): Promise<AdminMe> {
    const res = await api.get('/admin/me');
    return res.data;
  },

  /**
   * GET /admin/cron-health — liveness data for the in-process crons.
   * Returns an empty array shortly after a deploy (records reset on
   * dyno restart). Used by AdminDashboardScreen to flag missing crons.
   */
  async getCronHealth(): Promise<CronHealthResponse> {
    const res = await api.get('/admin/cron-health');
    return res.data;
  },

  /**
   * POST /admin/cron/run/:id — manually fire a cron right now. Useful
   * for verifying changes to a cron handler without waiting an hour
   * for the next tick. Allowed ids: 'retention', 'weekly-summary',
   * 'admin-digest'. Idempotent — each cron has its own *SentAt /
   * hour-of-day gates.
   */
  async runCron(id: 'retention' | 'weekly-summary' | 'admin-digest'): Promise<{
    ok: boolean;
    id: string;
    sent?: unknown;
  }> {
    // Long timeout — runAllRetentionCohorts can iterate 200+ users with
    // a push + email per user. The 60s default axios timeout would
    // kill genuine-but-slow runs.
    const res = await api.post(`/admin/cron/run/${id}`, undefined, { timeout: 90_000 });
    return res.data;
  },

  /**
   * POST /admin/test-notification — fire a test push and/or email to
   * the calling admin's account. Always per-actor (no userId param) so
   * it can't be used to spam other users. `channel` selects which
   * channel(s) to test; default is both.
   *
   * Resolves to per-channel sent flags; an error object is included
   * when one or both channels failed (the endpoint still 200s).
   */
  async sendTestNotification(channel: 'push' | 'email' | 'both' = 'both'): Promise<{
    pushSent: boolean;
    emailSent: boolean;
    errors?: Record<string, string>;
  }> {
    const res = await api.post('/admin/test-notification', { channel });
    return res.data;
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  async getAnalytics(days?: number): Promise<AdminAnalytics> {
    const res = await api.get('/admin/analytics', { params: { days } });
    return res.data;
  },

  /**
   * Key metrics dashboard — the 5 numbers a solo founder needs to see in
   * one place: paying users, monthly churn, ARPU, activation rate, and the
   * signup→paid funnel. Optimised for AdminMetricsKeyScreen which shows
   * each number with a healthy/unhealthy indicator. Cached server-side
   * 5 min; pass refresh=true to bust the cache.
   */
  async getKeyMetrics(opts?: { refresh?: boolean; days?: 7 | 14 | 30 | 60 | 90 }): Promise<KeyMetrics> {
    const params: Record<string, string | number> = {};
    if (opts?.refresh) params.refresh = 1;
    if (opts?.days) params.days = opts.days;
    const res = await api.get('/admin/metrics/key', { params });
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

  async changeUserRole(userId: string, role: string, stepup?: AdminStepUpCreds): Promise<{ id: string; email: string; firstName: string; role: UserRole }> {
    const res = await api.patch(`/admin/users/${userId}/role`, { role, ...(stepup ?? {}) });
    return res.data;
  },

  async changeUserSubscription(userId: string, data: {
    plan: 'free' | 'pro' | 'trainer' | 'club';
    status?: 'active' | 'cancelled' | 'expired';
    endDate?: string;
  }, stepup?: AdminStepUpCreds): Promise<unknown> {
    const res = await api.patch(`/admin/users/${userId}/subscription`, { ...data, ...(stepup ?? {}) });
    return res.data;
  },

  async banUser(userId: string, reason: string, stepup?: AdminStepUpCreds): Promise<unknown> {
    const res = await api.post(`/admin/users/${userId}/ban`, { reason, ...(stepup ?? {}) });
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

  async deleteUser(userId: string, stepup?: AdminStepUpCreds): Promise<unknown> {
    // R240 audit follow-up: server requires step-up re-auth via the
    // request body. axios.delete supports `{ data }` for body payload.
    const res = await api.delete(`/admin/users/${userId}`, { data: stepup });
    return res.data;
  },

  async getUserSecurityEvents(userId: string): Promise<Array<{ id: string; action: string; ip: string | null; userAgent: string | null; details: string | null; createdAt: string }>> {
    const res = await api.get(`/admin/users/${userId}/security-events`);
    return res.data;
  },

  async getUserSessions(userId: string): Promise<Array<{ id: string; createdAt: string; expiresAt: string; userAgent: string | null; ip: string | null }>> {
    const res = await api.get(`/admin/users/${userId}/sessions`);
    return res.data;
  },

  async forceLogoutUser(userId: string, stepup?: AdminStepUpCreds): Promise<{ ok: boolean; revokedCount: number }> {
    const res = await api.post(`/admin/users/${userId}/force-logout`, stepup ?? {});
    return res.data;
  },

  async forceDisable2FA(userId: string, stepup?: AdminStepUpCreds): Promise<{ ok: boolean }> {
    const res = await api.post(`/admin/users/${userId}/force-disable-2fa`, stepup ?? {});
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
