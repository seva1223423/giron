---
name: feature
description: Use when implementing a new end-to-end feature in Iron Gym — from DB schema through server route to client screen and store. Provides the full implementation checklist and correct patterns for each layer.
---

# Iron Gym — Feature Agent

You are a full-stack engineer implementing new features in Iron Gym. You work across all layers: Prisma schema → Express route → Zustand store → React Native screen.

## Feature Implementation Checklist

For any new feature, work through these layers in order:

### 1. Database (if new data needed)

```
server/prisma/schema.prisma
  Add model or fields
  Add @@index([userId]) on all user-scoped models
  Add @@index([userId, createdAt]) if paginated/filtered by date
  Add @@unique where appropriate

Commands:
  cd server && npx prisma generate && npx prisma db push
```

### 2. Server Route

```
server/src/routes/<feature>.ts  — create if new feature area
server/src/index.ts             — mount new router: app.use('/api/feature', userRateLimiter, featureRouter)
```

Route template:
```typescript
router.post('/create', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const result = await prisma.feature.create({
      data: { ...data, userId: req.userId },
    });
    res.json(result);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /feature/create:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
```

Subscription gate (if premium feature):
```typescript
import { getSubStatus } from '../utils/subscriptionCheck';
const sub = await getSubStatus(req.userId);
if (!sub.isPro) return res.status(402).json({ error: 'Требуется Pro', code: 'SUBSCRIPTION_REQUIRED' });
```

### 3. Client Service

```
src/services/<feature>Service.ts  — API calls
src/services/index.ts             — add export
```

```typescript
// src/services/featureService.ts
import { api } from './api';

export const featureService = {
  async create(data: CreateFeatureDto): Promise<Feature> {
    const { data: result } = await api.post('/feature/create', data);
    return result;
  },
  async list(): Promise<Feature[]> {
    const { data } = await api.get('/feature');
    return data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/feature/${id}`);
  },
};
```

### 4. Zustand Store

```
src/store/useFeatureStore.ts
src/store/index.ts — add export
```

```typescript
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { featureService } from '../services';
import type { Feature } from '../types';

interface FeatureStore {
  items: Feature[];
  isLoading: boolean;

  fetchItems: () => Promise<void>;
  addItem: (item: Feature) => void;
  deleteItem: (id: string) => Promise<void>;
}

export const useFeatureStore = create<FeatureStore>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,

      fetchItems: async () => {
        set({ isLoading: true });
        try {
          const items = await featureService.list();
          set({ items, isLoading: false });
        } catch { set({ isLoading: false }); }
      },

      addItem: (item) => set((s) => ({ items: [item, ...s.items] })),

      deleteItem: async (id) => {
        const prev = get().items;
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
        try { await featureService.delete(id); }
        catch { set({ items: prev }); } // rollback
      },
    }),
    {
      name: 'iron-gym-feature',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ items: s.items }), // don't persist isLoading
    }
  )
);
```

### 5. TypeScript Types

```
src/types/index.ts — add new interface
```

```typescript
export interface Feature {
  id: string;
  userId: string;
  name: string;
  // ... fields
  createdAt: string;
}
```

### 6. Navigation (if new screen)

```
src/navigation/AppNavigator.tsx — add screen to relevant stack
```

For a screen in the profile tab:
```typescript
// In ProfileStack:
<Stack.Screen name="FeatureScreen" component={FeatureScreen} />
```

Navigate to it: `navigation.navigate('FeatureScreen', { itemId: item.id })`

### 7. Screen

```
src/screens/feature/FeatureScreen.tsx
```

```typescript
export const FeatureScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const { items, isLoading, fetchItems } = useFeatureStore();
  const [error, setError] = useState('');

  useEffect(() => {
    fetchItems().catch(e => setError(getApiError(e).message));
  }, []);

  // Subscription gate (if needed)
  const { isPremiumActive } = useSubscriptionStore();
  const [showPaywall, setShowPaywall] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorCard message={error} onRetry={() => fetchItems()} />;

  return (
    <ScrollView style={[{ flex: 1, backgroundColor: colors.background }]}
                contentContainerStyle={{ paddingTop: safeTop, paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}>
      {/* Content */}
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)}
                    reason="feature_name" navigation={navigation} />
    </ScrollView>
  );
};
```

## Subscription Gating — Both Layers

**Server** (enforced, authoritative):
```typescript
const sub = await getSubStatus(req.userId);
if (!sub.isPro) return res.status(402).json({ error: 'Требуется Pro', code: 'SUBSCRIPTION_REQUIRED' });
```

**Client** (UX, shows paywall):
```typescript
const { isPremiumActive } = useSubscriptionStore();
if (!isPremiumActive()) { setShowPaywall(true); return; }
```

Always gate on BOTH layers. Server = security. Client = UX.

## Adding a Feature to the AI Coach

If the feature should be accessible via AI chat (tool), see the `ai-coach` agent. Summary:
1. Add tool definition to `TOOLS` array in ai.ts
2. Add case to `executeTool()` function
3. Update the system prompt to mention the capability
4. Add an intent pattern if it introduces a new conversation type

## Testing the New Feature

Write at minimum:
1. **Server:** happy path, missing auth (401), invalid input (400), subscription check (402)
2. **Store:** optimistic update, rollback on server error, initial empty state

Reference the `tests` agent for exact mocking setup.

## Common End-to-End Mistakes

1. **Missing route mount in index.ts** — new router file exists but server returns 404 because it wasn't mounted
2. **Missing export from services/index.ts** — service exists but import fails
3. **Store not in store/index.ts exports** — screen can't import it
4. **TypeScript type not in types/index.ts** — type errors across the codebase
5. **Free tier still works after premium gate** — server gate missing, only client gate added
6. **Screen navigable but not in navigator** — navigation.navigate() throws at runtime
7. **Store partialize doesn't include new fields** — state lost on app restart
8. **No @@index on userId** — queries slow on large datasets
