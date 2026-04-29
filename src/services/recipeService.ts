import { api } from './api';

export type RecipeSource = 'CURATED' | 'AI' | 'USER';

export type Allergen = 'lactose' | 'gluten' | 'eggs' | 'nuts' | 'fish' | 'soy';
export type Goal = 'weight-loss' | 'maintain' | 'gain';

export interface RecipeIngredient {
  name: string;
  weightGrams: number;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
}

export interface Recipe {
  id: string;
  source: RecipeSource;
  userId: string | null;
  name: string;
  descriptionRu: string | null;
  imageUrl: string | null;
  totalCalories: number;
  totalProtein: number;
  totalFats: number;
  totalCarbs: number;
  prepTimeMin: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  allergens: Allergen[];
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /recipes and PATCH /recipes/:id (the part the client controls). */
export interface RecipeBody {
  name: string;
  descriptionRu?: string;
  imageUrl?: string;
  prepTimeMin: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  allergens: Allergen[];
}

/** Server returns this from /ai-generate — same shape as Recipe but no id/createdAt yet. */
export interface AIRecipeDraft extends RecipeBody {
  source: 'AI';
  totalCalories: number;
  totalProtein: number;
  totalFats: number;
  totalCarbs: number;
}

export interface CuratedFilter {
  goal?: Goal;
  /** Allergens to EXCLUDE — comma-joined on the wire. */
  allergens?: Allergen[];
  maxPrepMin?: number;
  take?: number;
  skip?: number;
}

export interface AddToDiaryParams {
  date: string; // YYYY-MM-DD
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  servings?: number;
}

export const recipeService = {
  async listCurated(filter: CuratedFilter = {}): Promise<Recipe[]> {
    const params: Record<string, string | number> = {};
    if (filter.goal) params.goal = filter.goal;
    if (filter.allergens?.length) params.allergen = filter.allergens.join(',');
    if (filter.maxPrepMin) params.maxPrepMin = filter.maxPrepMin;
    if (filter.take != null) params.take = filter.take;
    if (filter.skip != null) params.skip = filter.skip;
    const { data } = await api.get<Recipe[]>('/recipes/curated', { params });
    return data;
  },

  async listMine(take = 50, skip = 0): Promise<Recipe[]> {
    const { data } = await api.get<Recipe[]>('/recipes/mine', { params: { take, skip } });
    return data;
  },

  async getOne(id: string): Promise<Recipe> {
    const { data } = await api.get<Recipe>(`/recipes/${id}`);
    return data;
  },

  async create(body: RecipeBody): Promise<Recipe> {
    const { data } = await api.post<Recipe>('/recipes', body);
    return data;
  },

  async update(id: string, body: RecipeBody): Promise<Recipe> {
    const { data } = await api.patch<Recipe>(`/recipes/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/recipes/${id}`);
  },

  async generateWithAI(query: string, constraints?: {
    maxCalories?: number;
    maxPrepMin?: number;
    allergensExcluded?: Allergen[];
    goal?: Goal;
  }): Promise<AIRecipeDraft> {
    const { data } = await api.post<AIRecipeDraft>('/recipes/ai-generate', { query, constraints });
    return data;
  },

  async addToDiary(id: string, params: AddToDiaryParams): Promise<unknown> {
    const { data } = await api.post(`/recipes/${id}/add-to-diary`, params);
    return data;
  },
};
