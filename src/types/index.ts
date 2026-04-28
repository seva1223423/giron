// ==================== USER ====================
export type UserRole = 'guest' | 'visitor' | 'client' | 'trainer' | 'support' | 'admin';
export type TrainingGoal = 'weight_loss' | 'muscle_gain' | 'strength' | 'endurance' | 'flexibility' | 'general_fitness';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type Gender = 'male' | 'female';
export type MeasurementUnit = 'metric' | 'imperial';

export interface HealthRestriction {
  id: string;
  bodyPart: string;
  description: string;
  severity: 'mild' | 'moderate' | 'severe';
}

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: Gender;
  heightCm?: number;
  weightKg?: number;
  goal?: TrainingGoal;
  fitnessLevel?: FitnessLevel;
  trainingExperienceYears?: number;
  healthRestrictions: HealthRestriction[];
  gymId?: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  // Auth & security
  emailVerified?: boolean;
  phoneVerified?: boolean;
  vkId?: string | null;
  googleId?: string | null;
  yandexId?: string | null;
  mailruId?: string | null;
  hasVk?: boolean;
  hasYandex?: boolean;
  hasGoogle?: boolean;
  hasOk?: boolean;
  hasMailru?: boolean;
  isBanned?: boolean;
  banReason?: string | null;
  lockedUntil?: string | null;
  loginAttempts?: number;
}

// ==================== EXERCISES ====================
export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'forearms' | 'quadriceps' | 'hamstrings' | 'glutes'
  | 'calves' | 'abs' | 'obliques' | 'traps' | 'lats'
  | 'lower_back' | 'hip_flexors' | 'adductors' | 'abductors';

export type ExerciseType = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'cardio' | 'stretch';
export type ExerciseCategory = 'strength' | 'cardio' | 'flexibility' | 'functional';

export interface Exercise {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  type: ExerciseType;
  category: ExerciseCategory;
  videoUrl?: string;
  youtubeId?: string;
  /** Rutube video ID (32-char hex). Used in the RuStore build where YouTube is unreliable in RF. */
  rutubeId?: string;
  imageUrl?: string;
  difficulty: FitnessLevel;
  tips?: string[];
  commonMistakes?: string[];
}

// ==================== ROUTINES ====================
export interface RoutineSet {
  id?: string;
  setNumber: number;
  type: SetType;
  reps?: number;
  weight?: number;
  rpe?: number;
}

export interface RoutineExercise {
  id?: string;
  exerciseId: string;
  exercise: Exercise;
  order: number;
  restSeconds: number;
  notes?: string;
  sets: RoutineSet[];
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  exercises: RoutineExercise[];
  createdAt: string;
  updatedAt: string;
}

// Shape returned by GET /workouts/routines/:id/history
export interface RoutineHistoryEntry {
  id: string;
  completedAt: string;
  durationMinutes: number | null;
  exercises: Array<{ exerciseId: string; name: string; maxWeight: number | null; totalReps: number }>;
}
export interface RoutineHistory {
  routineId: string;
  history: RoutineHistoryEntry[];
}

// Shape returned by POST /workouts/routines/:id/start
export interface RoutineStartPayload {
  routineId: string;
  name: string;
  lastUsedAt: string | null;
  exercises: Array<{
    exerciseId: string;
    exercise: Exercise;
    order: number;
    restSeconds: number;
    notes?: string | null;
    progressionApplied: boolean;
    previousWeight: number | null;
    sets: Array<{ setNumber: number; type: string; reps?: number; weight: number; completed: false }>;
  }>;
}

// ==================== WORKOUTS ====================
export type SetType = 'normal' | 'warmup' | 'dropset' | 'superset' | 'failure' | 'rest_pause';

export interface WorkoutSet {
  id: string;
  setNumber: number;
  type: SetType;
  reps?: number;
  weight?: number;
  duration?: number; // seconds, for cardio/plank
  distance?: number; // meters
  rpe?: number; // 1-10
  completed: boolean;
  notes?: string;
  isPR?: boolean; // личный рекорд по Epley 1RM
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  exercise: Exercise;
  order: number;
  sets: WorkoutSet[];
  restSeconds: number;
  supersetGroupId?: string;
  notes?: string;
}

export interface Workout {
  id: string;
  name: string;
  description?: string;
  exercises: WorkoutExercise[];
  scheduledDate?: string;
  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  totalVolume?: number; // kg
  notes?: string;
  rating?: number; // 1–5 субъективная оценка
  routineId?: string; // set when started from a Routine — enables lastUsedAt tracking
}

// ==================== PROGRAMS ====================
export type ProgramType = 'push_pull_legs' | 'upper_lower' | 'full_body' | 'bro_split' | '5_3_1' | 'custom';

export interface Program {
  id: string;
  name: string;
  description: string;
  type: ProgramType;
  goal: TrainingGoal;
  level: FitnessLevel;
  daysPerWeek: number;
  durationWeeks?: number;
  workouts: Workout[];
  isActive: boolean;
  createdBy: 'system' | 'user' | 'ai';
}

// ==================== NUTRITION ====================
export interface NutritionItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
  weightGrams: number;
  imageUrl?: string;
  confidence?: number;
}

export interface Meal {
  id: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  items: NutritionItem[];
  photoUrl?: string;
  totalCalories: number;
  totalProtein: number;
  totalFats: number;
  totalCarbs: number;
  createdAt: string;
}

export interface WaterLogEntry {
  time: string; // ISO time string e.g. "09:30"
  ml: number;
}

export interface DailyNutrition {
  date: string;
  meals: Meal[];
  waterMl: number;
  waterLog?: WaterLogEntry[];
  targetCalories: number;
  targetProtein: number;
  targetFats: number;
  targetCarbs: number;
  waterTargetMl?: number;
}

// ==================== NEWS ====================
export type NewsCategory = 'fitness' | 'nutrition' | 'sport' | 'health' | 'science' | 'russian' | 'powerlifting' | 'records' | 'victories' | 'championships' | 'club';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  imageUrl?: string;
  category: NewsCategory[];
  publishedAt: string;
  isSaved: boolean;
}

// ==================== AI CHAT ====================
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  actions?: AIAction[];
}

export interface AIAction {
  type: 'update_profile' | 'update_program' | 'update_workout' | 'add_meal' | 'explain_exercise';
  description: string;
  data: Record<string, unknown>;
  applied: boolean;
}

// ==================== PROGRESS ====================
export interface BodyWeight {
  date: string;
  weightKg: number;
}

export interface BodyMeasurement {
  date: string;
  chest?: number;    // грудь, см
  waist?: number;    // талия, см
  hips?: number;     // бёдра, см
  bicep?: number;    // бицепс (правый), см
  thigh?: number;    // бедро (правое), см
  calf?: number;     // икра (правая), см
  neck?: number;     // шея, см
}

export type CardioType = 'running' | 'cycling' | 'swimming' | 'walking' | 'hiit' | 'elliptical' | 'rowing' | 'other';

export interface CardioSession {
  id: string;
  type: CardioType;
  date: string;
  durationMinutes: number;
  distanceKm?: number;
  caloriesBurned?: number;
  avgHeartRate?: number;
  notes?: string;
  createdAt: string;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  estimated1RM: number;
  date: string;
}

export interface WorkoutStats {
  totalWorkouts: number;
  totalVolume: number;
  totalDuration: number;
  averageWorkoutDuration: number;
  currentStreak: number;
  longestStreak: number;
}

// ==================== SETTINGS ====================
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'ru' | 'en';
  units: MeasurementUnit;
  notifications: {
    workoutReminder: boolean;
    nutritionReminder: boolean;
    newsUpdates: boolean;
    aiTips: boolean;
  };
  restTimerDefault: number;
  hapticFeedback: boolean;
}

// ==================== SUPPORT ====================
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketCategory = 'billing' | 'technical' | 'feature_request' | 'account' | 'bug' | 'other';

export interface SupportAuthor {
  id: string;
  firstName: string;
  lastName?: string;
  role: UserRole;
}

export interface SupportMessage {
  id: string;
  content: string;
  isStaff: boolean;
  isInternal?: boolean;
  authorId: string;
  author: SupportAuthor;
  ticketId: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  userId: string;
  user?: { id: string; firstName: string; lastName?: string; email: string };
  assignedToId?: string;
  assignedTo?: { firstName: string; lastName?: string } | null;
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}

// ==================== ADMIN ====================
export interface AdminUserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName?: string;
  role: UserRole;
  createdAt: string;
  isBanned: boolean;
  banReason?: string;
  phone?: string | null;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  vkId?: string | null;
  googleId?: string | null;
  lockedUntil?: string | null;
  loginAttempts?: number;
  subscription?: { plan: string; status: string; endDate?: string | null } | null;
  workouts?: Array<{ completedAt?: string | null }>;
  _count: { workouts: number; chatMessages: number };
}

export interface AdminUserDetail extends AdminUserSummary {
  phone?: string;
  weightKg?: number;
  heightCm?: number;
  goal?: string;
  fitnessLevel?: string;
  bannedAt?: string;
  adminNote?: string;
  totpEnabled?: boolean;
  firstWorkoutAt?: string | null;
  workoutDates90d?: string[];
  _count: { workouts: number; meals: number; chatMessages: number; cardioSessions: number; supportTickets: number };
  workouts: Array<{ id: string; name: string; completedAt?: string; totalVolume?: number; durationMinutes?: number }>;
  supportTickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
  chatMessages: Array<{ id: string; content: string; createdAt: string }>;
  cardioSessions?: Array<{ id: string; type: string; durationMinutes: number; distanceKm?: number | null; caloriesBurned?: number | null; createdAt: string }>;
  bodyWeights?: Array<{ id: string; weightKg: number; date: string }>;
  sleepEntries?: Array<{ id: string; date: string; durationHours: number; quality?: number | null }>;
  aiMemories?: Array<{ id: string; category: string; key: string; value: string; confidence: number; source: string; updatedAt: string }>;
}

export interface AdminStats {
  users: {
    total: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    activeNow: number;
    activeHour: number;
    banned: number;
    withSubscription: number;
    withoutSubscription: number;
    byRole: Record<string, number>;
  };
  subscriptions: Array<{ plan: string; status: string; count: number }>;
  subsExpiringSoon?: number;
  trends?: { usersWeekVsPrev: number | null; workoutsWeekVsPrev: number | null; aiWeekVsPrev: number | null };
  topActiveUsers?: Array<{ userId: string; name: string; workouts: number }>;
  topAiActiveUsers?: Array<{ userId: string; name: string; messages: number }>;
  dau?: { workoutUsers: number; aiUsers: number };
  mau?: { workoutUsers: number; aiUsers: number };
  workouts: { completedToday: number; completedThisWeek: number; total: number };
  nutrition: { mealsToday: number; mealsThisWeek: number };
  cardio: { sessionsToday: number; sessionsThisWeek: number };
  ai: {
    messagesToday: number;
    messagesThisWeek: number;
    requestsToday: number;
    requestsThisWeek: number;
    cacheHitRate: number;
    cacheHits: number;
    cacheMisses: number;
    totalTokensEstimate: number;
    errorsToday: number;
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    provider: string;
    providerDisplayName: string;
    providerModel: string;
  };
  support: { openTickets: number; inProgressTickets: number; resolvedTickets: number; urgentTickets?: number; overdueTickets?: number };
  activeAnnouncements?: number;
  churnRiskUsers?: number;
  recentSignups?: Array<{ id: string; firstName: string; lastName?: string | null; email: string; createdAt: string; role: string }>;
  hourlyPulse?: number[];
  onlineUsers?: Array<{ id: string; firstName: string; lastName?: string | null; role: string }>;
  todayVsYesterday?: {
    signups: { today: number; yesterday: number };
    workouts: { today: number; yesterday: number };
    ai: { today: number; yesterday: number };
    meals: { today: number; yesterday: number };
    cardio: { today: number; yesterday: number };
  };
  demographics?: {
    goals: Record<string, number>;
    levels: Record<string, number>;
    genders: Record<string, number>;
  };
  server: {
    uptimeSeconds: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    systemMemUsedPct: number;
    systemMemFreeMb: number;
    systemMemTotalMb: number;
    loadAvg: number[];
    platform: string;
    nodeVersion: string;
    dbPingMs: number | null;
  };
}

export interface AdminLog {
  id: string;
  action: string;
  targetId?: string;
  details?: string;
  adminId: string;
  admin: { firstName: string; lastName?: string; email: string };
  createdAt: string;
}

export type AnnouncementType = 'info' | 'warning' | 'maintenance' | 'promo';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  isActive: boolean;
  endsAt?: string | null;
  targetRole?: string | null;
  viewCount?: number;
  createdAt: string;
  author?: { firstName: string; lastName?: string };
}

export interface AdminAnalytics {
  timeline: Array<{ date: string; signups: number; workouts: number; ai: number; cardio: number }>;
  funnel: {
    totalUsers: number;
    paidUsers: number;
    activeLastWeek: number;
    conversionRate: number;
    retentionRate: number;
  };
  previous?: { signups: number; workouts: number; ai: number; cardio: number };
  topPrograms?: Array<{ id: string; name: string; type: string; count: number }>;
  topExercises?: Array<{ id: string; name: string; type: string; count: number }>;
  period: number;
  onboardingFunnel?: {
    signups: number;
    profiled: number;
    firstWorkout: number;
    converted: number;
  };
}
