/**
 * Tests for leaderboard logic extracted from workout.ts
 *
 * The leaderboard applies these rules:
 * 1. Users must have >= 10 completed workouts
 * 2. Users must have been active in the last 90 days
 * 3. Exercise entries are "verified" only if the user did the exercise in >= 3 separate workouts
 * 4. 1RM is estimated using: Math.round(weight * (1 + reps / 30))
 * 5. Results are sorted by estimated 1RM descending, top 100
 */

// ─── 1RM Formula ─────────────────────────────────────────────────────────────

const calc1RM = (weight: number, reps: number): number =>
  Math.round(weight * (1 + reps / 30));

// ─── Leaderboard Filtering Logic (extracted) ─────────────────────────────────

interface WorkoutGroupBy {
  userId: string;
  _count: { id: number };
  _max: { completedAt: Date | null };
}

interface SetEntry {
  weight: number;
  reps: number;
  exerciseId: string;
  exerciseName: string;
  workoutId: string;
  userId: string;
  userName: string;
  completedAt: Date | null;
}

interface LeaderboardEntry {
  exerciseName: string;
  userName: string;
  weightKg: number;
  reps: number;
  estimated1RM: number;
  date: string | null;
  verified: boolean;
}

function buildLeaderboard(
  activeUsers: WorkoutGroupBy[],
  sets: SetEntry[],
  ninetyDaysAgo: Date,
): (LeaderboardEntry & { rank: number })[] {
  // Step 1: Filter users with >= 10 workouts and active in last 90 days
  const verifiedUserIds = new Set(
    activeUsers
      .filter((u) => u._count.id >= 10 && u._max.completedAt && u._max.completedAt >= ninetyDaysAgo)
      .map((u) => u.userId),
  );

  if (verifiedUserIds.size === 0) return [];

  // Step 2: Only keep sets from verified users
  const filteredSets = sets.filter((s) => verifiedUserIds.has(s.userId));

  // Step 3: Count distinct workouts per user+exercise
  const exerciseWorkoutCount = new Map<string, Set<string>>();
  filteredSets.forEach((s) => {
    const key = `${s.userId}::${s.exerciseId}`;
    if (!exerciseWorkoutCount.has(key)) exerciseWorkoutCount.set(key, new Set());
    exerciseWorkoutCount.get(key)!.add(s.workoutId);
  });

  // Step 4: Best 1RM per user+exercise
  const bestMap = new Map<string, LeaderboardEntry>();
  filteredSets.forEach((s) => {
    if (!s.weight || !s.reps) return;
    const est1rm = calc1RM(s.weight, s.reps);
    const key = `${s.userId}::${s.exerciseId}`;
    const existing = bestMap.get(key);
    const exerciseSessions = exerciseWorkoutCount.get(key)?.size ?? 0;
    const verified = exerciseSessions >= 3;

    if (!existing || est1rm > existing.estimated1RM) {
      bestMap.set(key, {
        exerciseName: s.exerciseName,
        userName: s.userName,
        weightKg: s.weight,
        reps: s.reps,
        estimated1RM: est1rm,
        date: s.completedAt?.toISOString() ?? null,
        verified,
      });
    }
  });

  // Step 5: Sort and take top 100
  return Array.from(bestMap.values())
    .sort((a, b) => b.estimated1RM - a.estimated1RM)
    .slice(0, 100)
    .map((entry, i) => ({ rank: i + 1, ...entry }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Leaderboard Logic', () => {
  const now = new Date('2026-04-09T12:00:00Z');
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const recentDate = new Date('2026-03-15T10:00:00Z'); // within 90 days
  const oldDate = new Date('2025-12-01T10:00:00Z');    // > 90 days ago

  // ─── User Eligibility ──────────────────────────────────────────────────

  describe('User eligibility filtering', () => {
    it('should exclude user with < 10 workouts', () => {
      const activeUsers: WorkoutGroupBy[] = [
        { userId: 'user-few', _count: { id: 5 }, _max: { completedAt: recentDate } },
        { userId: 'user-enough', _count: { id: 15 }, _max: { completedAt: recentDate } },
      ];

      const sets: SetEntry[] = [
        { weight: 100, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w1', userId: 'user-few', userName: 'Few', completedAt: recentDate },
        { weight: 100, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w2', userId: 'user-enough', userName: 'Enough', completedAt: recentDate },
      ];

      const result = buildLeaderboard(activeUsers, sets, ninetyDaysAgo);
      expect(result.length).toBe(1);
      expect(result[0].userName).toBe('Enough');
    });

    it('should exclude user inactive > 90 days', () => {
      const activeUsers: WorkoutGroupBy[] = [
        { userId: 'user-old', _count: { id: 20 }, _max: { completedAt: oldDate } },
        { userId: 'user-active', _count: { id: 20 }, _max: { completedAt: recentDate } },
      ];

      const sets: SetEntry[] = [
        { weight: 150, reps: 3, exerciseId: 'squat', exerciseName: 'Squat', workoutId: 'w1', userId: 'user-old', userName: 'Old', completedAt: oldDate },
        { weight: 120, reps: 5, exerciseId: 'squat', exerciseName: 'Squat', workoutId: 'w2', userId: 'user-active', userName: 'Active', completedAt: recentDate },
      ];

      const result = buildLeaderboard(activeUsers, sets, ninetyDaysAgo);
      expect(result.length).toBe(1);
      expect(result[0].userName).toBe('Active');
    });

    it('should return empty array when no users qualify', () => {
      const activeUsers: WorkoutGroupBy[] = [
        { userId: 'user-1', _count: { id: 3 }, _max: { completedAt: recentDate } },
      ];
      const result = buildLeaderboard(activeUsers, [], ninetyDaysAgo);
      expect(result).toEqual([]);
    });

    it('should return empty when all users are inactive', () => {
      const activeUsers: WorkoutGroupBy[] = [
        { userId: 'user-1', _count: { id: 50 }, _max: { completedAt: oldDate } },
        { userId: 'user-2', _count: { id: 30 }, _max: { completedAt: oldDate } },
      ];
      const result = buildLeaderboard(activeUsers, [], ninetyDaysAgo);
      expect(result).toEqual([]);
    });
  });

  // ─── Exercise Verification ─────────────────────────────────────────────

  describe('Exercise verification (>= 3 separate workouts)', () => {
    const eligibleUser: WorkoutGroupBy = {
      userId: 'user-1', _count: { id: 20 }, _max: { completedAt: recentDate },
    };

    it('should mark exercise as NOT verified with < 3 workouts', () => {
      const sets: SetEntry[] = [
        { weight: 100, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w1', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
        { weight: 105, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w2', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
      ];

      const result = buildLeaderboard([eligibleUser], sets, ninetyDaysAgo);
      expect(result.length).toBe(1);
      expect(result[0].verified).toBe(false);
    });

    it('should mark exercise as verified with >= 3 workouts', () => {
      const sets: SetEntry[] = [
        { weight: 100, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w1', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
        { weight: 105, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w2', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
        { weight: 110, reps: 3, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w3', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
      ];

      const result = buildLeaderboard([eligibleUser], sets, ninetyDaysAgo);
      expect(result.length).toBe(1);
      expect(result[0].verified).toBe(true);
    });

    it('should count DISTINCT workouts (not sets)', () => {
      // 3 sets but only 2 distinct workouts
      const sets: SetEntry[] = [
        { weight: 100, reps: 5, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w1', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
        { weight: 105, reps: 4, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w1', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
        { weight: 110, reps: 3, exerciseId: 'bench', exerciseName: 'Bench Press', workoutId: 'w2', userId: 'user-1', userName: 'Ivan', completedAt: recentDate },
      ];

      const result = buildLeaderboard([eligibleUser], sets, ninetyDaysAgo);
      expect(result[0].verified).toBe(false); // only 2 distinct workouts
    });
  });

  // ─── 1RM Calculation Accuracy ──────────────────────────────────────────

  describe('1RM calculation accuracy', () => {
    it('100kg x 1 rep = 103', () => {
      expect(calc1RM(100, 1)).toBe(103);
    });

    it('100kg x 5 reps = 117', () => {
      expect(calc1RM(100, 5)).toBe(117);
    });

    it('100kg x 10 reps = 133', () => {
      expect(calc1RM(100, 10)).toBe(133);
    });

    it('140kg x 3 reps = 154', () => {
      expect(calc1RM(140, 3)).toBe(154);
    });

    it('60kg x 12 reps = 84', () => {
      expect(calc1RM(60, 12)).toBe(84);
    });

    it('200kg x 1 rep = 207', () => {
      expect(calc1RM(200, 1)).toBe(207);
    });

    it('0 weight should return 0', () => {
      expect(calc1RM(0, 10)).toBe(0);
    });
  });

  // ─── Ranking and Sorting ───────────────────────────────────────────────

  describe('Ranking and sorting', () => {
    const users: WorkoutGroupBy[] = [
      { userId: 'u1', _count: { id: 50 }, _max: { completedAt: recentDate } },
      { userId: 'u2', _count: { id: 30 }, _max: { completedAt: recentDate } },
      { userId: 'u3', _count: { id: 20 }, _max: { completedAt: recentDate } },
    ];

    it('should rank by estimated 1RM descending', () => {
      const sets: SetEntry[] = [
        { weight: 80, reps: 10, exerciseId: 'bench', exerciseName: 'Bench', workoutId: 'w1', userId: 'u1', userName: 'A', completedAt: recentDate },
        { weight: 140, reps: 3, exerciseId: 'squat', exerciseName: 'Squat', workoutId: 'w2', userId: 'u2', userName: 'B', completedAt: recentDate },
        { weight: 60, reps: 15, exerciseId: 'ohp', exerciseName: 'OHP', workoutId: 'w3', userId: 'u3', userName: 'C', completedAt: recentDate },
      ];

      const result = buildLeaderboard(users, sets, ninetyDaysAgo);
      // u2: 140*(1+3/30) = 154, u1: 80*(1+10/30) = 107, u3: 60*(1+15/30) = 90
      expect(result[0].rank).toBe(1);
      expect(result[0].estimated1RM).toBe(154);
      expect(result[1].rank).toBe(2);
      expect(result[1].estimated1RM).toBe(107);
      expect(result[2].rank).toBe(3);
      expect(result[2].estimated1RM).toBe(90);
    });

    it('should keep only the best 1RM per user+exercise', () => {
      const sets: SetEntry[] = [
        { weight: 100, reps: 5, exerciseId: 'bench', exerciseName: 'Bench', workoutId: 'w1', userId: 'u1', userName: 'A', completedAt: recentDate },
        { weight: 110, reps: 3, exerciseId: 'bench', exerciseName: 'Bench', workoutId: 'w2', userId: 'u1', userName: 'A', completedAt: recentDate },
        { weight: 90, reps: 8, exerciseId: 'bench', exerciseName: 'Bench', workoutId: 'w3', userId: 'u1', userName: 'A', completedAt: recentDate },
      ];

      const result = buildLeaderboard(users, sets, ninetyDaysAgo);
      // Only 1 entry for u1+bench: best is max of 117, 121, 114 => 121
      expect(result.length).toBe(1);
      expect(result[0].estimated1RM).toBe(121); // 110*(1+3/30)
    });

    it('should limit to top 100 entries', () => {
      // Create 150 unique user+exercise combos
      const manyUsers = Array.from({ length: 150 }, (_, i) => ({
        userId: `u${i}`, _count: { id: 20 }, _max: { completedAt: recentDate },
      }));
      const manySets = manyUsers.map((u, i) => ({
        weight: 50 + i, reps: 5, exerciseId: 'bench', exerciseName: 'Bench',
        workoutId: `w${i}`, userId: u.userId, userName: `User${i}`, completedAt: recentDate,
      }));

      const result = buildLeaderboard(manyUsers, manySets, ninetyDaysAgo);
      expect(result.length).toBe(100);
      // First entry should have the highest 1RM
      expect(result[0].rank).toBe(1);
      expect(result[99].rank).toBe(100);
    });

    it('should skip sets with 0 weight or 0 reps', () => {
      const sets: SetEntry[] = [
        { weight: 0, reps: 10, exerciseId: 'bench', exerciseName: 'Bench', workoutId: 'w1', userId: 'u1', userName: 'A', completedAt: recentDate },
        { weight: 100, reps: 0, exerciseId: 'bench', exerciseName: 'Bench', workoutId: 'w2', userId: 'u1', userName: 'A', completedAt: recentDate },
      ];

      const result = buildLeaderboard(users, sets, ninetyDaysAgo);
      expect(result.length).toBe(0);
    });
  });
});
