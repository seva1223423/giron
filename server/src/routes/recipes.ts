import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { sanitizeForPrompt } from '../utils/inputSanitizer';
import { chat as llmChat } from '../services/llm/router';

const router = Router();

const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[] | undefined) => typeof id === 'string' && CUID_RE.test(id);

// ── Shared schemas ────────────────────────────────────────────────────────────

const ALLERGENS = ['lactose', 'gluten', 'eggs', 'nuts', 'fish', 'soy'] as const;
const GOALS = ['weight-loss', 'maintain', 'gain'] as const;

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  weightGrams: z.number().finite().min(1).max(10000),
  calories: z.number().finite().min(0).max(10000),
  protein: z.number().finite().min(0).max(1000),
  fats: z.number().finite().min(0).max(1000),
  carbs: z.number().finite().min(0).max(1000),
});

const recipeBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  descriptionRu: z.string().trim().max(1000).optional(),
  imageUrl: z.string().url().max(2048).optional(),
  prepTimeMin: z.number().int().min(1).max(600),
  servings: z.number().int().min(1).max(50).default(1),
  ingredients: z.array(ingredientSchema).min(1).max(50),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(50),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
});

function computeTotals(items: z.infer<typeof ingredientSchema>[]) {
  return {
    totalCalories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
    totalProtein: Math.round(items.reduce((s, i) => s + i.protein, 0) * 10) / 10,
    totalFats: Math.round(items.reduce((s, i) => s + i.fats, 0) * 10) / 10,
    totalCarbs: Math.round(items.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
  };
}

// ── List curated ──────────────────────────────────────────────────────────────

router.get('/curated', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = z.object({
      goal: z.enum(GOALS).optional(),
      allergen: z.string().optional(), // CSV of allergens to EXCLUDE
      maxPrepMin: z.coerce.number().int().min(1).max(600).optional(),
      take: z.coerce.number().int().min(1).max(100).default(30),
      skip: z.coerce.number().int().min(0).max(10000).default(0),
    }).parse(req.query);

    const excludedAllergens = q.allergen
      ? q.allergen.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const where: any = { source: 'CURATED' };
    if (q.goal) where.tags = { has: q.goal };
    if (q.maxPrepMin) where.prepTimeMin = { lte: q.maxPrepMin };
    if (excludedAllergens.length > 0) {
      // Postgres array operator: NOT ANY allergen IN (excluded[])
      where.NOT = { allergens: { hasSome: excludedAllergens } };
    }

    const recipes = await prisma.recipe.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.take,
      skip: q.skip,
    });

    res.json(recipes);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('GET /recipes/curated', e);
    res.status(500).json({ error: 'Не удалось загрузить рецепты' });
  }
});

// ── List user's own ───────────────────────────────────────────────────────────

router.get('/mine', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = z.object({
      take: z.coerce.number().int().min(1).max(100).default(50),
      skip: z.coerce.number().int().min(0).max(10000).default(0),
    }).parse(req.query);

    const recipes = await prisma.recipe.findMany({
      where: { userId: req.userId, source: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: q.take,
      skip: q.skip,
    });
    res.json(recipes);
  } catch (e) {
    logger.error('GET /recipes/mine', e);
    res.status(500).json({ error: 'Не удалось загрузить ваши рецепты' });
  }
});

// ── Get single ────────────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id as string } });
    if (!recipe) return res.status(404).json({ error: 'Рецепт не найден' });
    // Users can read CURATED recipes, but USER recipes only their own
    if (recipe.source === 'USER' && recipe.userId !== req.userId) {
      return res.status(404).json({ error: 'Рецепт не найден' });
    }
    res.json(recipe);
  } catch (e) {
    logger.error('GET /recipes/:id', e);
    res.status(500).json({ error: 'Не удалось загрузить рецепт' });
  }
});

// ── Create user recipe ────────────────────────────────────────────────────────

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = recipeBodySchema.parse(req.body);
    const totals = computeTotals(parsed.ingredients);

    const created = await prisma.recipe.create({
      data: {
        source: 'USER',
        userId: req.userId!,
        name: parsed.name,
        descriptionRu: parsed.descriptionRu,
        imageUrl: parsed.imageUrl,
        prepTimeMin: parsed.prepTimeMin,
        servings: parsed.servings,
        ingredients: parsed.ingredients,
        steps: parsed.steps,
        tags: parsed.tags,
        allergens: parsed.allergens,
        ...totals,
      },
    });
    res.status(201).json(created);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /recipes', e);
    res.status(500).json({ error: 'Не удалось сохранить рецепт' });
  }
});

// ── Update own ────────────────────────────────────────────────────────────────

router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const existing = await prisma.recipe.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Рецепт не найден' });
    if (existing.source !== 'USER' || existing.userId !== req.userId) {
      return res.status(403).json({ error: 'Нельзя редактировать чужие или системные рецепты' });
    }

    const parsed = recipeBodySchema.parse(req.body);
    const totals = computeTotals(parsed.ingredients);

    const updated = await prisma.recipe.update({
      where: { id: req.params.id as string },
      data: {
        name: parsed.name,
        descriptionRu: parsed.descriptionRu,
        imageUrl: parsed.imageUrl,
        prepTimeMin: parsed.prepTimeMin,
        servings: parsed.servings,
        ingredients: parsed.ingredients,
        steps: parsed.steps,
        tags: parsed.tags,
        allergens: parsed.allergens,
        ...totals,
      },
    });
    res.json(updated);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('PATCH /recipes/:id', e);
    res.status(500).json({ error: 'Не удалось обновить рецепт' });
  }
});

// ── Delete own ────────────────────────────────────────────────────────────────

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const existing = await prisma.recipe.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Рецепт не найден' });
    if (existing.source !== 'USER' || existing.userId !== req.userId) {
      return res.status(403).json({ error: 'Нельзя удалять чужие или системные рецепты' });
    }
    await prisma.recipe.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (e) {
    logger.error('DELETE /recipes/:id', e);
    res.status(500).json({ error: 'Не удалось удалить рецепт' });
  }
});

// ── AI generate (no DB write) ─────────────────────────────────────────────────

const aiGenerateSchema = z.object({
  query: z.string().trim().min(3).max(500),
  constraints: z.object({
    maxCalories: z.number().int().min(50).max(5000).optional(),
    maxPrepMin: z.number().int().min(1).max(600).optional(),
    allergensExcluded: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).optional(),
    goal: z.enum(GOALS).optional(),
  }).optional(),
});

const AI_RECIPE_SYSTEM = `Ты — диетолог-кулинар. Отвечай ТОЛЬКО валидным JSON, без markdown и без комментариев. Все поля обязательны кроме descriptionRu и imageUrl. Все КБЖУ — на ПОРЦИЮ.

Формат:
{
  "name": "Название блюда",
  "descriptionRu": "Краткое описание 1-2 предложения",
  "prepTimeMin": 30,
  "servings": 2,
  "ingredients": [
    {"name": "Куриная грудка", "weightGrams": 200, "calories": 220, "protein": 41, "fats": 5, "carbs": 0}
  ],
  "steps": ["Шаг 1...", "Шаг 2..."],
  "tags": ["high-protein", "lunch"],
  "allergens": []
}

allergens: только из ["lactose","gluten","eggs","nuts","fish","soy"]. Если блюдо содержит ингредиент с аллергеном — добавь.
КБЖУ ингредиента считай на указанный weightGrams. Сумма ингредиентов = одна порция × servings.
tags: weight-loss / maintain / gain (выбери одно по контексту); breakfast/lunch/dinner/snack; high-protein если белка > 25г/порция.`;

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

router.post('/ai-generate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = aiGenerateSchema.parse(req.body);
    const safeQuery = sanitizeForPrompt(parsed.query, 500);

    const constraints = parsed.constraints ?? {};
    const constraintLines: string[] = [];
    if (constraints.maxCalories) constraintLines.push(`- Не более ${constraints.maxCalories} ккал на порцию`);
    if (constraints.maxPrepMin) constraintLines.push(`- Время готовки не более ${constraints.maxPrepMin} минут`);
    if (constraints.goal) constraintLines.push(`- Цель: ${constraints.goal}`);
    if (constraints.allergensExcluded?.length) {
      constraintLines.push(`- Исключи аллергены: ${constraints.allergensExcluded.join(', ')}`);
    }

    const userMsg =
      `Сгенерируй рецепт по запросу: "${safeQuery}".` +
      (constraintLines.length ? `\nОграничения:\n${constraintLines.join('\n')}` : '') +
      `\nОтветь ТОЛЬКО JSON без markdown.`;

    const result = await llmChat({
      system: AI_RECIPE_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      maxTokens: 1500,
      temperature: 0.7,
    });

    const block = extractJsonBlock(result.content || '');
    if (!block) return res.status(502).json({ error: 'AI вернул некорректный ответ' });

    let parsedRecipe: any;
    try {
      parsedRecipe = JSON.parse(block);
    } catch {
      return res.status(502).json({ error: 'AI вернул некорректный JSON' });
    }

    // Validate via the same recipe body schema (drops bad fields)
    const validated = recipeBodySchema.safeParse(parsedRecipe);
    if (!validated.success) {
      return res.status(502).json({
        error: 'AI вернул некорректные данные',
        details: validated.error.flatten(),
      });
    }
    const totals = computeTotals(validated.data.ingredients);

    res.json({
      source: 'AI',
      ...validated.data,
      ...totals,
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /recipes/ai-generate', e);
    res.status(500).json({ error: 'Не удалось сгенерировать рецепт' });
  }
});

// ── Add to diary ──────────────────────────────────────────────────────────────

const addToDiarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Некорректная дата'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  servings: z.number().int().min(1).max(20).default(1),
});

router.post('/:id/add-to-diary', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const parsed = addToDiarySchema.parse(req.body);

    const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id as string } });
    if (!recipe) return res.status(404).json({ error: 'Рецепт не найден' });
    if (recipe.source === 'USER' && recipe.userId !== req.userId) {
      return res.status(404).json({ error: 'Рецепт не найден' });
    }

    const ingredients = recipe.ingredients as Array<{
      name: string;
      weightGrams: number;
      calories: number;
      protein: number;
      fats: number;
      carbs: number;
    }>;

    const scale = parsed.servings / Math.max(1, recipe.servings);

    const items = ingredients.map((ing) => ({
      name: String(ing.name).slice(0, 200),
      weightGrams: Number(ing.weightGrams) * scale,
      calories: Number(ing.calories) * scale,
      protein: Number(ing.protein) * scale,
      fats: Number(ing.fats) * scale,
      carbs: Number(ing.carbs) * scale,
    }));

    const totalCalories = Math.round(items.reduce((s, i) => s + i.calories, 0));
    const totalProtein = Math.round(items.reduce((s, i) => s + i.protein, 0) * 10) / 10;
    const totalFats = Math.round(items.reduce((s, i) => s + i.fats, 0) * 10) / 10;
    const totalCarbs = Math.round(items.reduce((s, i) => s + i.carbs, 0) * 10) / 10;

    const meal = await prisma.meal.create({
      data: {
        type: parsed.mealType,
        date: parsed.date,
        totalCalories,
        totalProtein,
        totalFats,
        totalCarbs,
        userId: req.userId!,
        items: {
          create: items.map((i) => ({
            name: i.name,
            calories: i.calories,
            protein: i.protein,
            fats: i.fats,
            carbs: i.carbs,
            weightGrams: i.weightGrams,
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json(meal);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /recipes/:id/add-to-diary', e);
    res.status(500).json({ error: 'Не удалось добавить в дневник' });
  }
});

export { router as recipesRouter };
