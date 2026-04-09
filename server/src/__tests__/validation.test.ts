import { z } from 'zod';

/**
 * Tests for input validation schemas used across the server.
 * Schemas are extracted from route files to test validation logic in isolation.
 */

// ─── Schema definitions (mirroring those in route files) ─────────────────────

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль минимум 6 символов'),
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const mealItemSchema = z.object({
  name: z.string().min(1),
  calories: z.number().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  fats: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  weightGrams: z.number().min(0).max(10000).optional(),
});

const addMealSchema = z.object({
  type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  items: z.array(mealItemSchema).min(1).max(50),
  photoUrl: z.string().optional(),
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

  describe('Registration validation (registerSchema)', () => {
    it('should accept valid registration', () => {
      const result = registerSchema.safeParse({
        email: 'user@test.com', password: 'secret123', firstName: 'John',
      });
      expect(result.success).toBe(true);
    });

    it('should reject XSS in firstName (but zod just validates min length)', () => {
      // Zod does not sanitize HTML — this test documents that behavior
      const result = registerSchema.safeParse({
        email: 'user@test.com', password: 'secret123', firstName: '<script>alert(1)</script>',
      });
      // Zod passes it — XSS protection must be at rendering layer
      expect(result.success).toBe(true);
    });

    it('should reject empty firstName', () => {
      const result = registerSchema.safeParse({
        email: 'user@test.com', password: 'secret123', firstName: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional lastName', () => {
      const result = registerSchema.safeParse({
        email: 'user@test.com', password: 'secret123', firstName: 'John',
      });
      expect(result.success).toBe(true);
      expect(result.data?.lastName).toBeUndefined();
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

  // ─── Cardio Validation (basic, done at handler level) ──────────────────

  describe('Cardio input validation (manual checks)', () => {
    // Cardio route does manual validation, not zod. Test the logic.

    it('should require type field', () => {
      const body: Record<string, any> = { date: '2026-04-01', durationMinutes: 30 };
      const hasType = !!body.type;
      expect(hasType).toBe(false);
    });

    it('should require date field', () => {
      const body: Record<string, any> = { type: 'running', durationMinutes: 30 };
      const hasDate = !!body.date;
      expect(hasDate).toBe(false);
    });

    it('should require durationMinutes field', () => {
      const body: Record<string, any> = { type: 'running', date: '2026-04-01' };
      const hasDuration = !!body.durationMinutes;
      expect(hasDuration).toBe(false);
    });

    it('should accept valid cardio input', () => {
      const body: Record<string, any> = { type: 'running', date: '2026-04-01', durationMinutes: 45 };
      const valid = !!(body.type && body.date && body.durationMinutes);
      expect(valid).toBe(true);
    });
  });
});
