import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  recipeService,
  type Recipe,
  type RecipeBody,
  type CuratedFilter,
  type Allergen,
  type Goal,
} from '../services/recipeService';

interface RecipesState {
  curated: Recipe[];
  mine: Recipe[];
  loadingCurated: boolean;
  loadingMine: boolean;
  error: string | null;

  /** Currently active filter for curated browse. Persisted so the user
   *  returns to the same view between sessions. */
  filter: { goal?: Goal; allergens: Allergen[]; maxPrepMin?: number };
  setFilter: (next: Partial<RecipesState['filter']>) => void;

  fetchCurated: () => Promise<void>;
  fetchMine: () => Promise<void>;

  createMine: (body: RecipeBody) => Promise<Recipe>;
  updateMine: (id: string, body: RecipeBody) => Promise<Recipe>;
  removeMine: (id: string) => Promise<void>;

  clearError: () => void;
  clearUserData: () => void;
}

export const useRecipesStore = create<RecipesState>()(
  persist(
    (set, get) => ({
      curated: [],
      mine: [],
      loadingCurated: false,
      loadingMine: false,
      error: null,
      filter: { allergens: [] },

      setFilter: (next) => set((s) => ({ filter: { ...s.filter, ...next } })),

      fetchCurated: async () => {
        set({ loadingCurated: true, error: null });
        try {
          const f = get().filter;
          const filter: CuratedFilter = {
            goal: f.goal,
            allergens: f.allergens.length ? f.allergens : undefined,
            maxPrepMin: f.maxPrepMin,
            take: 100,
          };
          const list = await recipeService.listCurated(filter);
          set({ curated: list, loadingCurated: false });
        } catch {
          // Keep existing cache on network failure — offline-first parity with
          // sleep/cardio/measurements stores (commits 9aebbb8/c0875b2/54e479c).
          set({ loadingCurated: false, error: 'Не удалось загрузить рецепты' });
        }
      },

      fetchMine: async () => {
        set({ loadingMine: true, error: null });
        try {
          const list = await recipeService.listMine();
          set({ mine: list, loadingMine: false });
        } catch {
          set({ loadingMine: false, error: 'Не удалось загрузить ваши рецепты' });
        }
      },

      createMine: async (body) => {
        try {
          const created = await recipeService.create(body);
          set((s) => ({ mine: [created, ...s.mine] }));
          return created;
        } catch (e) {
          set({ error: 'Не удалось сохранить рецепт' });
          throw e;
        }
      },

      updateMine: async (id, body) => {
        try {
          const updated = await recipeService.update(id, body);
          set((s) => ({ mine: s.mine.map((r) => (r.id === id ? updated : r)) }));
          return updated;
        } catch (e) {
          set({ error: 'Не удалось обновить рецепт' });
          throw e;
        }
      },

      removeMine: async (id) => {
        // Optimistic remove — restore on failure (better than letting the
        // user stare at a stale row while we wait for the server).
        const prev = get().mine;
        set({ mine: prev.filter((r) => r.id !== id) });
        try {
          await recipeService.remove(id);
        } catch (e) {
          set({ mine: prev, error: 'Не удалось удалить рецепт' });
          throw e;
        }
      },

      clearError: () => set({ error: null }),
      clearUserData: () => set({ curated: [], mine: [], filter: { allergens: [] } }),
    }),
    {
      name: 'iron-gym-recipes',
      storage: createJSONStorage(() => AsyncStorage),
      // Keep filter + cached lists across sessions; transient flags don't persist.
      partialize: (s) => ({
        curated: s.curated,
        mine: s.mine,
        filter: s.filter,
      }),
    },
  ),
);
