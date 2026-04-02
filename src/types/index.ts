// ==================== USER ====================
export type UserRole = 'guest' | 'visitor' | 'client' | 'trainer' | 'admin';
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
  imageUrl?: string;
  difficulty: FitnessLevel;
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

export interface DailyNutrition {
  date: string;
  meals: Meal[];
  waterMl: number;
  targetCalories: number;
  targetProtein: number;
  targetFats: number;
  targetCarbs: number;
  waterTargetMl?: number;
}

// ==================== NEWS ====================
export type NewsCategory = 'russian' | 'powerlifting' | 'records' | 'victories' | 'championships' | 'club';

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
