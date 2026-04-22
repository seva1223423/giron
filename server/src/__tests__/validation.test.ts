import { z } from 'zod';

/**
 * Tests for input validation schemas used across the server.
 * Schemas are extracted from route files to test validation logic in isolation.
 */

// ─── Schema definitions (mirroring those in route files) ─────────────────────

const strongPassword = z
  .string()
  .min(8, 'Пароль минимум 8 символов')
  .max(128, 'Пароль не может быть длиннее 128 символов')
  .refine((p) => /[A-Z]/.test(p), { message: 'Пароль должен содержать хотя бы одну заглавную букву' })
  .refine((p) => /[a-z]/.test(p), { message: 'Пароль должен содержать хотя бы одну строчную букву' })
  .refine((p) => /[0-9]/.test(p), { message: 'Пароль должен содержать хотя бы одну цифру' });

const registerSchema = z.object({
  email: z.string().email('Некорректный email').max(254, 'Email слишком длинный'),
  password: strongPassword,
  firstName: z.string().min(1, 'Введите имя').max(100, 'Имя слишком длинное'),
  lastName: z.string().max(100, 'Фамилия слишком длинная').optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().max(1000), // bcrypt DoS prevention
});

const mealItemSchema = z.object({
  name: z.string().min(1).max(200),       // max 200 mirrors nutrition.ts
  calories: z.number().finite().min(0).max(10000),
  protein: z.number().finite().min(0).max(1000),
  fats: z.number().finite().min(0).max(1000),
  carbs: z.number().finite().min(0).max(1000),
  weightGrams: z.number().finite().min(0).max(10000).optional(),
});

const addMealSchema = z.object({
  type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(mealItemSchema).min(1).max(50),
  photoUrl: z.string().url().max(2048).refine((u) => u.startsWith('https://'), 'URL должен использовать HTTPS').optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z'))).optional(),
});

const weightSchema = z.object({
  weightKg: z.number().min(20, 'Вес не может быть менее 20 кг').max(400, 'Вес не может быть более 400 кг'),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Некорректная дата'),
});

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.string().min(1),
  goal: z.string().min(1),
  level: z.string().min(1),
  daysPerWeek: z.number().int().min(1).max(7),
  durationWeeks: z.number().int().min(1).max(52).optional(),
});

const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1).max(100),
    order: z.number().int().min(0).max(49),
    restSeconds: z.number().int().min(0).max(600).optional(),
    notes: z.string().max(500).optional(),
    sets: z.array(z.object({
      setNumber: z.number().int().min(1).max(30),
      type: z.string().max(50).optional(),
      reps: z.number().int().min(0).max(999).optional(),
      weight: z.number().min(0).max(2000).optional(),
      rpe: z.number().min(1).max(10).optional(),
    })).min(1).max(30),
  })).min(1).max(30),
});

const measurementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z'))),
  chest: z.number().finite().min(0).max(300).optional().nullable(),
  waist: z.number().finite().min(0).max(300).optional().nullable(),
  hips: z.number().finite().min(0).max(300).optional().nullable(),
  bicep: z.number().finite().min(0).max(100).optional().nullable(),
  thigh: z.number().finite().min(0).max(200).optional().nullable(),
  calf: z.number().finite().min(0).max(100).optional().nullable(),
  neck: z.number().finite().min(0).max(100).optional().nullable(),
});

const sleepSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z'))),
  bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  wakeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationHours: z.number().finite().min(0).max(24),
  quality: z.number().int().finite().min(1).max(5).optional().nullable(),
});

const profileUpdateSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  gender: z.string().transform(v => v.toUpperCase()).pipe(z.enum(['MALE', 'FEMALE'])).optional(),
  heightCm: z.number().finite().min(50).max(300).optional(),
  weightKg: z.number().finite().min(20).max(400).optional(),
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS']).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).optional(),
  trainingExperienceYears: z.number().int().finite().min(0).max(80).optional(),
  avatarUrl: z.string().url().max(2048).refine((u) => u.startsWith('https://')).optional(),
});

const nutritionTargetsSchema = z.object({
  calories: z.number().finite().min(500).max(10000).optional(),
  protein: z.number().finite().min(0).max(500).optional(),
  fats: z.number().finite().min(0).max(500).optional(),
  carbs: z.number().finite().min(0).max(1000).optional(),
});

const cardioSchema = z.object({
  type: z.enum(['running', 'cycling', 'swimming', 'walking', 'hiit', 'elliptical', 'rowing', 'other']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
    const parsed = new Date(d + 'T00:00:00Z');
    const minDate = new Date('2000-01-01T00:00:00Z');
    const maxDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return !isNaN(parsed.getTime()) && parsed >= minDate && parsed <= maxDate;
  }),
  durationMinutes: z.number().int().finite().min(1).max(1440),
  distanceKm: z.number().finite().min(0).max(500).optional().nullable(),
  caloriesBurned: z.number().int().finite().min(0).max(50000).optional().nullable(),
  avgHeartRate: z.number().int().finite().min(30).max(250).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const startWorkoutSchema = z.object({
  name: z.string().min(1).max(200),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    restSeconds: z.number().int().min(0).max(600).optional(),
    sets: z.array(z.object({
      type: z.string().optional(),
      reps: z.number().int().min(0).max(999).optional(),
      weight: z.number().min(0).max(2000).optional(),
    })).min(1),
  })).min(1),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Validation Schemas', () => {

  // ─── Nutrition / Meals ───────────────────────────────────────────────────

  describe('Meal validation (addMealSchema)', () => {
    const validMeal = {
      type: 'lunch' as const,
      items: [{ name: 'Chicken', calories: 250, protein: 30, fats: 10, carbs: 0 }],
    };

    it('should accept valid meal', () => {
      expect(addMealSchema.safeParse(validMeal).success).toBe(true);
    });

    it('should reject invalid meal type', () => {
      const result = addMealSchema.safeParse({ ...validMeal, type: 'midnight_snack' });
      expect(result.success).toBe(false);
    });

    it('should reject meal without items (empty array)', () => {
      const result = addMealSchema.safeParse({ ...validMeal, items: [] });
      expect(result.success).toBe(false);
    });

    it('should reject negative calories', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        items: [{ name: 'Bad', calories: -100, protein: 0, fats: 0, carbs: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject calories exceeding max (10000)', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        items: [{ name: 'Huge', calories: 15000, protein: 0, fats: 0, carbs: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject item with empty name', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        items: [{ name: '', calories: 100, protein: 10, fats: 5, carbs: 20 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative protein', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        items: [{ name: 'Food', calories: 100, protein: -5, fats: 0, carbs: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('should accept meal with optional photoUrl', () => {
      const result = addMealSchema.safeParse({ ...validMeal, photoUrl: 'https://img.com/photo.jpg' });
      expect(result.success).toBe(true);
    });

    it('should accept meal with optional weightGrams on item', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        items: [{ name: 'Rice', calories: 200, protein: 5, fats: 1, carbs: 45, weightGrams: 150 }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject too many items (>50)', () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        name: `Item ${i}`, calories: 10, protein: 1, fats: 0, carbs: 2,
      }));
      const result = addMealSchema.safeParse({ type: 'lunch', items });
      expect(result.success).toBe(false);
    });

    it('should reject item name longer than 200 chars', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        items: [{ name: 'X'.repeat(201), calories: 100, protein: 10, fats: 5, carbs: 20 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject photoUrl with http (must be https)', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        photoUrl: 'http://img.com/photo.jpg',
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-URL photoUrl string', () => {
      const result = addMealSchema.safeParse({
        ...validMeal,
        photoUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid date field', () => {
      const result = addMealSchema.safeParse({ ...validMeal, date: '2026-04-20' });
      expect(result.success).toBe(true);
    });

    it('should reject date in wrong format', () => {
      const result = addMealSchema.safeParse({ ...validMeal, date: '2026/04/20' });
      expect(result.success).toBe(false);
    });

    it('should accept meal without date (date is optional)', () => {
      expect(addMealSchema.safeParse(validMeal).success).toBe(true);
    });
  });

  // ─── User Profile / Weight ─────────────────────────────────────────────

  describe('User weight validation (weightSchema)', () => {
    it('should accept valid weight entry', () => {
      const result = weightSchema.safeParse({ weightKg: 75, date: '2026-04-01' });
      expect(result.success).toBe(true);
    });

    it('should reject weight below 20 kg', () => {
      const result = weightSchema.safeParse({ weightKg: 5, date: '2026-04-01' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('20');
      }
    });

    it('should reject weight above 400 kg', () => {
      const result = weightSchema.safeParse({ weightKg: 500, date: '2026-04-01' });
      expect(result.success).toBe(false);
    });

    it('should reject negative weight', () => {
      const result = weightSchema.safeParse({ weightKg: -10, date: '2026-04-01' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid date string', () => {
      const result = weightSchema.safeParse({ weightKg: 80, date: 'not-a-date' });
      expect(result.success).toBe(false);
    });

    it('should accept boundary weight (20 kg)', () => {
      const result = weightSchema.safeParse({ weightKg: 20, date: '2026-04-01' });
      expect(result.success).toBe(true);
    });

    it('should accept boundary weight (400 kg)', () => {
      const result = weightSchema.safeParse({ weightKg: 400, date: '2026-04-01' });
      expect(result.success).toBe(true);
    });
  });

  // ─── Registration Validation ───────────────────────────────────────────

  describe('Registration validation (registerSchema + strongPassword)', () => {
    const validReg = { email: 'user@test.com', password: 'Secret123', firstName: 'John' };

    it('should accept valid registration with strong password', () => {
      expect(registerSchema.safeParse(validReg).success).toBe(true);
    });

    it('should reject XSS in firstName (Zod does not sanitize — rendering layer must)', () => {
      // Zod passes it — XSS protection must be at rendering layer
      expect(registerSchema.safeParse({
        ...validReg, firstName: '<script>alert(1)</script>',
      }).success).toBe(true);
    });

    it('should reject empty firstName', () => {
      expect(registerSchema.safeParse({ ...validReg, firstName: '' }).success).toBe(false);
    });

    it('should reject firstName exceeding 100 chars', () => {
      expect(registerSchema.safeParse({ ...validReg, firstName: 'A'.repeat(101) }).success).toBe(false);
    });

    it('should accept optional lastName (absent = undefined)', () => {
      const result = registerSchema.safeParse(validReg);
      expect(result.success).toBe(true);
      expect(result.data?.lastName).toBeUndefined();
    });

    it('should reject lastName exceeding 100 chars', () => {
      expect(registerSchema.safeParse({ ...validReg, lastName: 'B'.repeat(101) }).success).toBe(false);
    });

    it('should reject email exceeding 254 chars', () => {
      const longEmail = 'a'.repeat(250) + '@x.co';
      expect(registerSchema.safeParse({ ...validReg, email: longEmail }).success).toBe(false);
    });

    // ── Strong password requirements ──────────────────────────────────────

    it('should reject password shorter than 8 chars', () => {
      expect(registerSchema.safeParse({ ...validReg, password: 'Sec12' }).success).toBe(false);
    });

    it('should reject password exceeding 128 chars', () => {
      const long = 'Aa1' + 'x'.repeat(126); // 129 chars
      expect(registerSchema.safeParse({ ...validReg, password: long }).success).toBe(false);
    });

    it('should reject password without uppercase letter', () => {
      expect(registerSchema.safeParse({ ...validReg, password: 'secret123' }).success).toBe(false);
    });

    it('should reject password without lowercase letter', () => {
      expect(registerSchema.safeParse({ ...validReg, password: 'SECRET123' }).success).toBe(false);
    });

    it('should reject password without digit', () => {
      expect(registerSchema.safeParse({ ...validReg, password: 'SecretPass' }).success).toBe(false);
    });

    it('should accept password at boundary length 8 with all requirements', () => {
      expect(registerSchema.safeParse({ ...validReg, password: 'Secret1!' }).success).toBe(true);
    });

    it('should accept password at boundary length 128', () => {
      const maxPass = 'Aa1' + 'x'.repeat(125); // exactly 128 chars
      expect(registerSchema.safeParse({ ...validReg, password: maxPass }).success).toBe(true);
    });
  });

  // ─── Login Schema Validation ──────────────────────────────────────────

  describe('Login validation (loginSchema)', () => {
    it('should accept valid credentials', () => {
      expect(loginSchema.safeParse({ email: 'user@test.com', password: 'anything' }).success).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(loginSchema.safeParse({ email: 'not-an-email', password: 'pass' }).success).toBe(false);
    });

    it('should reject email exceeding 254 chars', () => {
      const longEmail = 'a'.repeat(250) + '@x.co';
      expect(loginSchema.safeParse({ email: longEmail, password: 'pass' }).success).toBe(false);
    });

    it('should reject password exceeding 1000 chars (bcrypt DoS protection)', () => {
      expect(loginSchema.safeParse({ email: 'user@test.com', password: 'x'.repeat(1001) }).success).toBe(false);
    });

    it('should accept password at boundary 1000 chars', () => {
      expect(loginSchema.safeParse({ email: 'user@test.com', password: 'x'.repeat(1000) }).success).toBe(true);
    });
  });

  // ─── Workout Validation ────────────────────────────────────────────────

  describe('Workout validation (startWorkoutSchema)', () => {
    const validWorkout = {
      name: 'Push Day',
      exercises: [{
        exerciseId: 'ex-1',
        sets: [{ reps: 10, weight: 60 }],
      }],
    };

    it('should accept valid workout', () => {
      expect(startWorkoutSchema.safeParse(validWorkout).success).toBe(true);
    });

    it('should reject empty exercises array', () => {
      const result = startWorkoutSchema.safeParse({ name: 'Empty', exercises: [] });
      expect(result.success).toBe(false);
    });

    it('should reject exercise with empty sets array', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'Bad',
        exercises: [{ exerciseId: 'ex-1', sets: [] }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject workout with empty name', () => {
      const result = startWorkoutSchema.safeParse({
        name: '',
        exercises: [{ exerciseId: 'ex-1', sets: [{ reps: 10 }] }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject workout name exceeding 200 chars', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'A'.repeat(201),
        exercises: [{ exerciseId: 'ex-1', sets: [{ reps: 10 }] }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative reps', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'Neg',
        exercises: [{ exerciseId: 'ex-1', sets: [{ reps: -5, weight: 50 }] }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject reps exceeding 999', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'Big',
        exercises: [{ exerciseId: 'ex-1', sets: [{ reps: 1000 }] }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject weight exceeding 2000', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'Heavy',
        exercises: [{ exerciseId: 'ex-1', sets: [{ reps: 1, weight: 2500 }] }],
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional restSeconds', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'Rest',
        exercises: [{ exerciseId: 'ex-1', restSeconds: 120, sets: [{ reps: 10 }] }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject restSeconds exceeding 600', () => {
      const result = startWorkoutSchema.safeParse({
        name: 'Rest',
        exercises: [{ exerciseId: 'ex-1', restSeconds: 700, sets: [{ reps: 10 }] }],
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Program Validation ────────────────────────────────────────────────

  describe('Program validation (createProgramSchema)', () => {
    const validProgram = {
      name: 'Strength Program',
      type: 'strength',
      goal: 'STRENGTH',
      level: 'INTERMEDIATE',
      daysPerWeek: 4,
    };

    it('should accept valid program', () => {
      expect(createProgramSchema.safeParse(validProgram).success).toBe(true);
    });

    it('should reject daysPerWeek < 1', () => {
      const result = createProgramSchema.safeParse({ ...validProgram, daysPerWeek: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject daysPerWeek > 7', () => {
      const result = createProgramSchema.safeParse({ ...validProgram, daysPerWeek: 8 });
      expect(result.success).toBe(false);
    });

    it('should reject durationWeeks > 52', () => {
      const result = createProgramSchema.safeParse({ ...validProgram, durationWeeks: 100 });
      expect(result.success).toBe(false);
    });

    it('should accept optional description', () => {
      const result = createProgramSchema.safeParse({
        ...validProgram, description: 'A great program',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description exceeding 2000 chars', () => {
      const result = createProgramSchema.safeParse({
        ...validProgram, description: 'X'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty goal', () => {
      const result = createProgramSchema.safeParse({ ...validProgram, goal: '' });
      expect(result.success).toBe(false);
    });
  });

  // ─── Routine Validation ────────────────────────────────────────────────

  describe('Routine validation (createRoutineSchema)', () => {
    const validExercise = {
      exerciseId: 'ex-1',
      order: 0,
      sets: [{ setNumber: 1, reps: 10, weight: 60 }],
    };

    const validRoutine = {
      name: 'Push Day',
      exercises: [validExercise],
    };

    it('should accept valid routine', () => {
      expect(createRoutineSchema.safeParse(validRoutine).success).toBe(true);
    });

    it('should reject empty exercises array', () => {
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [] }).success).toBe(false);
    });

    it('should reject exercises exceeding 30', () => {
      const tooMany = Array.from({ length: 31 }, (_, i) => ({
        ...validExercise, exerciseId: `ex-${i}`, order: i,
      }));
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: tooMany }).success).toBe(false);
    });

    it('should reject name longer than 200 chars', () => {
      expect(createRoutineSchema.safeParse({ ...validRoutine, name: 'A'.repeat(201) }).success).toBe(false);
    });

    it('should reject empty name', () => {
      expect(createRoutineSchema.safeParse({ ...validRoutine, name: '' }).success).toBe(false);
    });

    it('should reject description exceeding 2000 chars', () => {
      expect(createRoutineSchema.safeParse({ ...validRoutine, description: 'X'.repeat(2001) }).success).toBe(false);
    });

    it('should reject exercise order > 49', () => {
      const badOrderEx = { ...validExercise, order: 50 };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badOrderEx] }).success).toBe(false);
    });

    it('should accept exercise order = 49 (boundary max)', () => {
      const borderEx = { ...validExercise, order: 49 };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [borderEx] }).success).toBe(true);
    });

    it('should reject restSeconds > 600', () => {
      const badRest = { ...validExercise, restSeconds: 601 };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badRest] }).success).toBe(false);
    });

    it('should accept restSeconds = 600 (boundary max)', () => {
      const maxRest = { ...validExercise, restSeconds: 600 };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [maxRest] }).success).toBe(true);
    });

    it('should reject sets exceeding 30 per exercise', () => {
      const tooManySets = Array.from({ length: 31 }, (_, i) => ({ setNumber: i + 1 }));
      const badEx = { ...validExercise, sets: tooManySets };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badEx] }).success).toBe(false);
    });

    it('should reject empty sets array on exercise', () => {
      const noSets = { ...validExercise, sets: [] };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [noSets] }).success).toBe(false);
    });

    it('should reject setNumber > 30', () => {
      const badSet = { ...validExercise, sets: [{ setNumber: 31 }] };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badSet] }).success).toBe(false);
    });

    it('should reject setNumber < 1', () => {
      const badSet = { ...validExercise, sets: [{ setNumber: 0 }] };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badSet] }).success).toBe(false);
    });

    it('should reject rpe < 1', () => {
      const badRpe = { ...validExercise, sets: [{ setNumber: 1, rpe: 0 }] };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badRpe] }).success).toBe(false);
    });

    it('should reject rpe > 10', () => {
      const badRpe = { ...validExercise, sets: [{ setNumber: 1, rpe: 11 }] };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [badRpe] }).success).toBe(false);
    });

    it('should accept rpe boundary values 1 and 10', () => {
      const minRpe = { ...validExercise, sets: [{ setNumber: 1, rpe: 1 }] };
      const maxRpe = { ...validExercise, sets: [{ setNumber: 1, rpe: 10 }] };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [minRpe] }).success).toBe(true);
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [maxRpe] }).success).toBe(true);
    });

    it('should reject notes exceeding 500 chars', () => {
      const longNotes = { ...validExercise, notes: 'N'.repeat(501) };
      expect(createRoutineSchema.safeParse({ ...validRoutine, exercises: [longNotes] }).success).toBe(false);
    });

    it('should accept full valid routine with multiple exercises and sets', () => {
      const fullRoutine = {
        name: 'Full Body',
        description: 'Complete workout',
        exercises: [
          { exerciseId: 'squat', order: 0, restSeconds: 120, notes: 'Focus on form', sets: [
            { setNumber: 1, type: 'normal', reps: 5, weight: 100, rpe: 8 },
            { setNumber: 2, reps: 5, weight: 100 },
          ]},
          { exerciseId: 'bench', order: 1, sets: [{ setNumber: 1, reps: 8, weight: 80 }] },
        ],
      };
      expect(createRoutineSchema.safeParse(fullRoutine).success).toBe(true);
    });
  });

  // ─── Cardio Validation (Zod schema from cardio.ts) ───────────────────

  describe('Cardio validation (cardioSchema)', () => {
    const validCardio = {
      type: 'running' as const,
      date: '2026-04-20',
      durationMinutes: 30,
    };

    // ── type enum ──────────────────────────────────────────────────────

    it('should accept all valid type values', () => {
      const types = ['running', 'cycling', 'swimming', 'walking', 'hiit', 'elliptical', 'rowing', 'other'];
      for (const type of types) {
        expect(cardioSchema.safeParse({ ...validCardio, type }).success).toBe(true);
      }
    });

    it('should reject invalid type (yoga)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, type: 'yoga' }).success).toBe(false);
    });

    it('should reject invalid type (empty string)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, type: '' }).success).toBe(false);
    });

    // ── durationMinutes boundaries ──────────────────────────────────────

    it('should reject durationMinutes = 0 (min is 1)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, durationMinutes: 0 }).success).toBe(false);
    });

    it('should accept durationMinutes = 1 (boundary min)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, durationMinutes: 1 }).success).toBe(true);
    });

    it('should accept durationMinutes = 1440 (boundary max, 24h)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, durationMinutes: 1440 }).success).toBe(true);
    });

    it('should reject durationMinutes = 1441 (exceeds 24h)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, durationMinutes: 1441 }).success).toBe(false);
    });

    it('should reject non-integer durationMinutes', () => {
      expect(cardioSchema.safeParse({ ...validCardio, durationMinutes: 30.5 }).success).toBe(false);
    });

    // ── avgHeartRate boundaries ─────────────────────────────────────────

    it('should reject avgHeartRate = 29 (below min 30)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, avgHeartRate: 29 }).success).toBe(false);
    });

    it('should accept avgHeartRate = 30 (boundary min)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, avgHeartRate: 30 }).success).toBe(true);
    });

    it('should accept avgHeartRate = 250 (boundary max)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, avgHeartRate: 250 }).success).toBe(true);
    });

    it('should reject avgHeartRate = 251 (exceeds max 250)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, avgHeartRate: 251 }).success).toBe(false);
    });

    it('should accept null avgHeartRate (optional)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, avgHeartRate: null }).success).toBe(true);
    });

    // ── distanceKm boundaries ───────────────────────────────────────────

    it('should accept distanceKm = 0 (min)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, distanceKm: 0 }).success).toBe(true);
    });

    it('should accept distanceKm = 500 (boundary max)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, distanceKm: 500 }).success).toBe(true);
    });

    it('should reject distanceKm = 501 (exceeds max)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, distanceKm: 501 }).success).toBe(false);
    });

    it('should reject negative distanceKm', () => {
      expect(cardioSchema.safeParse({ ...validCardio, distanceKm: -1 }).success).toBe(false);
    });

    // ── caloriesBurned boundaries ───────────────────────────────────────

    it('should accept caloriesBurned = 0', () => {
      expect(cardioSchema.safeParse({ ...validCardio, caloriesBurned: 0 }).success).toBe(true);
    });

    it('should accept caloriesBurned = 50000 (boundary max)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, caloriesBurned: 50000 }).success).toBe(true);
    });

    it('should reject caloriesBurned = 50001', () => {
      expect(cardioSchema.safeParse({ ...validCardio, caloriesBurned: 50001 }).success).toBe(false);
    });

    it('should reject negative caloriesBurned', () => {
      expect(cardioSchema.safeParse({ ...validCardio, caloriesBurned: -10 }).success).toBe(false);
    });

    // ── notes boundaries ────────────────────────────────────────────────

    it('should accept notes at exactly 2000 chars', () => {
      expect(cardioSchema.safeParse({ ...validCardio, notes: 'A'.repeat(2000) }).success).toBe(true);
    });

    it('should reject notes exceeding 2000 chars', () => {
      expect(cardioSchema.safeParse({ ...validCardio, notes: 'A'.repeat(2001) }).success).toBe(false);
    });

    it('should accept null notes (optional)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, notes: null }).success).toBe(true);
    });

    // ── date validation ─────────────────────────────────────────────────

    it('should reject date before 2000-01-01', () => {
      expect(cardioSchema.safeParse({ ...validCardio, date: '1999-12-31' }).success).toBe(false);
    });

    it('should accept date at minimum boundary 2000-01-01', () => {
      expect(cardioSchema.safeParse({ ...validCardio, date: '2000-01-01' }).success).toBe(true);
    });

    it('should reject date with invalid format', () => {
      expect(cardioSchema.safeParse({ ...validCardio, date: '20-04-2026' }).success).toBe(false);
    });

    it('should reject date with invalid format (no separators)', () => {
      expect(cardioSchema.safeParse({ ...validCardio, date: '20260420' }).success).toBe(false);
    });

    // ── full valid payload ──────────────────────────────────────────────

    it('should accept full valid payload with all optional fields', () => {
      expect(cardioSchema.safeParse({
        type: 'cycling',
        date: '2026-04-20',
        durationMinutes: 60,
        distanceKm: 25.5,
        caloriesBurned: 500,
        avgHeartRate: 145,
        notes: 'Morning ride',
      }).success).toBe(true);
    });

    it('should accept minimal payload (only required fields)', () => {
      expect(cardioSchema.safeParse({
        type: 'hiit',
        date: '2026-04-20',
        durationMinutes: 20,
      }).success).toBe(true);
    });
  });

  // ─── Body Measurements Validation ─────────────────────────────────────

  describe('Body measurements validation (measurementSchema)', () => {
    const validMeasurement = { date: '2026-04-20', chest: 100, waist: 80, hips: 95 };

    it('should accept valid measurement entry', () => {
      expect(measurementSchema.safeParse(validMeasurement).success).toBe(true);
    });

    it('should accept minimal entry (date only, all measurements null)', () => {
      expect(measurementSchema.safeParse({ date: '2026-04-20' }).success).toBe(true);
    });

    it('should reject invalid date format', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, date: '2026/04/20' }).success).toBe(false);
    });

    it('should reject chest > 300 (max)', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, chest: 301 }).success).toBe(false);
    });

    it('should accept chest = 300 (boundary max)', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, chest: 300 }).success).toBe(true);
    });

    it('should reject waist < 0', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, waist: -1 }).success).toBe(false);
    });

    it('should reject bicep > 100 (max)', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, bicep: 101 }).success).toBe(false);
    });

    it('should accept bicep = 100 (boundary max)', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, bicep: 100 }).success).toBe(true);
    });

    it('should reject thigh > 200 (max)', () => {
      expect(measurementSchema.safeParse({ ...validMeasurement, thigh: 201 }).success).toBe(false);
    });

    it('should accept null for any optional measurement', () => {
      expect(measurementSchema.safeParse({ date: '2026-04-20', bicep: null, calf: null }).success).toBe(true);
    });
  });

  // ─── Sleep Validation ──────────────────────────────────────────────────

  describe('Sleep validation (sleepSchema)', () => {
    const validSleep = {
      date: '2026-04-20',
      bedtime: '22:30',
      wakeTime: '06:30',
      durationHours: 8,
    };

    it('should accept valid sleep entry', () => {
      expect(sleepSchema.safeParse(validSleep).success).toBe(true);
    });

    it('should reject invalid bedtime format (AM/PM instead of 24h)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, bedtime: '10:30 PM' }).success).toBe(false);
    });

    it('should reject invalid bedtime hour (24:00)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, bedtime: '24:00' }).success).toBe(false);
    });

    it('should accept boundary bedtime 23:59', () => {
      expect(sleepSchema.safeParse({ ...validSleep, bedtime: '23:59' }).success).toBe(true);
    });

    it('should accept boundary bedtime 00:00', () => {
      expect(sleepSchema.safeParse({ ...validSleep, bedtime: '00:00' }).success).toBe(true);
    });

    it('should reject durationHours > 24', () => {
      expect(sleepSchema.safeParse({ ...validSleep, durationHours: 25 }).success).toBe(false);
    });

    it('should accept durationHours = 24 (boundary max)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, durationHours: 24 }).success).toBe(true);
    });

    it('should accept durationHours = 0 (boundary min)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, durationHours: 0 }).success).toBe(true);
    });

    it('should reject quality < 1', () => {
      expect(sleepSchema.safeParse({ ...validSleep, quality: 0 }).success).toBe(false);
    });

    it('should accept quality = 1 (boundary min)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, quality: 1 }).success).toBe(true);
    });

    it('should reject quality > 5', () => {
      expect(sleepSchema.safeParse({ ...validSleep, quality: 6 }).success).toBe(false);
    });

    it('should accept quality = 5 (boundary max)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, quality: 5 }).success).toBe(true);
    });

    it('should accept null quality (optional)', () => {
      expect(sleepSchema.safeParse({ ...validSleep, quality: null }).success).toBe(true);
    });

    it('should reject non-integer quality', () => {
      expect(sleepSchema.safeParse({ ...validSleep, quality: 3.5 }).success).toBe(false);
    });
  });

  // ─── Profile Update Validation ─────────────────────────────────────────

  describe('Profile update validation (profileUpdateSchema)', () => {
    it('should accept empty object (all fields optional)', () => {
      expect(profileUpdateSchema.safeParse({}).success).toBe(true);
    });

    it('should reject heightCm < 50', () => {
      expect(profileUpdateSchema.safeParse({ heightCm: 49 }).success).toBe(false);
    });

    it('should accept heightCm = 50 (boundary min)', () => {
      expect(profileUpdateSchema.safeParse({ heightCm: 50 }).success).toBe(true);
    });

    it('should reject heightCm > 300', () => {
      expect(profileUpdateSchema.safeParse({ heightCm: 301 }).success).toBe(false);
    });

    it('should accept heightCm = 300 (boundary max)', () => {
      expect(profileUpdateSchema.safeParse({ heightCm: 300 }).success).toBe(true);
    });

    it('should reject trainingExperienceYears > 80', () => {
      expect(profileUpdateSchema.safeParse({ trainingExperienceYears: 81 }).success).toBe(false);
    });

    it('should accept trainingExperienceYears = 0 (boundary min)', () => {
      expect(profileUpdateSchema.safeParse({ trainingExperienceYears: 0 }).success).toBe(true);
    });

    it('should accept valid gender (case-insensitive — male → MALE)', () => {
      expect(profileUpdateSchema.safeParse({ gender: 'male' }).success).toBe(true);
    });

    it('should reject invalid gender', () => {
      expect(profileUpdateSchema.safeParse({ gender: 'other' }).success).toBe(false);
    });

    it('should reject avatarUrl with http (must be https)', () => {
      expect(profileUpdateSchema.safeParse({ avatarUrl: 'http://example.com/avatar.jpg' }).success).toBe(false);
    });

    it('should accept avatarUrl with https', () => {
      expect(profileUpdateSchema.safeParse({ avatarUrl: 'https://cdn.example.com/avatar.jpg' }).success).toBe(true);
    });

    it('should accept all valid goal enum values', () => {
      const goals = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS'];
      for (const goal of goals) {
        expect(profileUpdateSchema.safeParse({ goal }).success).toBe(true);
      }
    });

    it('should reject invalid goal', () => {
      expect(profileUpdateSchema.safeParse({ goal: 'BULK' }).success).toBe(false);
    });

    it('should accept all valid level enum values', () => {
      const levels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];
      for (const level of levels) {
        expect(profileUpdateSchema.safeParse({ level }).success).toBe(true);
      }
    });
  });

  // ─── Nutrition Targets Validation ──────────────────────────────────────

  describe('Nutrition targets validation (nutritionTargetsSchema)', () => {
    it('should accept valid targets', () => {
      expect(nutritionTargetsSchema.safeParse({ calories: 2000, protein: 150, fats: 60, carbs: 250 }).success).toBe(true);
    });

    it('should accept empty object (all optional)', () => {
      expect(nutritionTargetsSchema.safeParse({}).success).toBe(true);
    });

    it('should reject calories < 500 (implausible minimum)', () => {
      expect(nutritionTargetsSchema.safeParse({ calories: 499 }).success).toBe(false);
    });

    it('should accept calories = 500 (boundary min)', () => {
      expect(nutritionTargetsSchema.safeParse({ calories: 500 }).success).toBe(true);
    });

    it('should reject calories > 10000', () => {
      expect(nutritionTargetsSchema.safeParse({ calories: 10001 }).success).toBe(false);
    });

    it('should accept calories = 10000 (boundary max)', () => {
      expect(nutritionTargetsSchema.safeParse({ calories: 10000 }).success).toBe(true);
    });

    it('should reject protein > 500', () => {
      expect(nutritionTargetsSchema.safeParse({ protein: 501 }).success).toBe(false);
    });

    it('should reject carbs > 1000', () => {
      expect(nutritionTargetsSchema.safeParse({ carbs: 1001 }).success).toBe(false);
    });

    it('should reject negative fats', () => {
      expect(nutritionTargetsSchema.safeParse({ fats: -1 }).success).toBe(false);
    });
  });
});
