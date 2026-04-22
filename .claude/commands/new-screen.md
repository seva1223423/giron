---
description: Scaffold a new React Native screen in Iron Gym. Argument: "ScreenName [tab] [description]" — e.g. "ExerciseHistory workouts Shows sets history for a single exercise". Generates screen file, adds to AppNavigator, updates navigation types.
---

You are scaffolding a new screen in the Iron Gym React Native app. Argument: **$ARGUMENTS**

Parse the argument as: `<ScreenName> <tab> <description>`. If tab is missing, ask for it. If description is missing, infer from name.

## Step 1 — Determine Location

Tab mapping to stack folder:
| Tab argument | Stack | Folder |
|-------------|-------|--------|
| `workouts` | WorkoutsStack | `src/screens/workouts/` |
| `nutrition` | NutritionStack | `src/screens/nutrition/` |
| `progress` | ProgressStack | `src/screens/progress/` |
| `ai` | AIStack | `src/screens/ai/` |
| `profile` | ProfileStack | `src/screens/profile/` |
| `home` | HomeStack | `src/screens/home/` |
| `news` | NewsStack | `src/screens/news/` |

```bash
ls C:/Users/sevka/Desktop/1223/work/iron-gym/src/screens/<tab>/
```

Check if the file already exists — if yes, stop and report.

## Step 2 — Determine if Premium Gate Needed

Ask yourself: is this a feature that should be gated behind a subscription?
- History / analytics beyond 10 items → gate
- AI-powered features → gate
- Free CRUD features → no gate

## Step 3 — Create Screen File

Use this template (fill in real content based on the description):

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Button, Card, FadeIn } from '../../components';
import { getApiError } from '../../services';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
// import { PaywallModal } from '../../components';       // uncomment if premium-gated
// import { useSubscriptionStore } from '../../store';    // uncomment if premium-gated

export const <ScreenName>Screen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  // const { isPremiumActive } = useSubscriptionStore(); // uncomment if premium-gated

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const [showPaywall, setShowPaywall] = useState(false); // uncomment if premium-gated

  useEffect(() => { load(); }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      // TODO: fetch data here
    } catch (err) {
      setError(getApiError(err).message); // never use err.message directly
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: safeTop, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={[typography.h4, { color: colors.text, flex: 1, textAlign: 'center' }]}><ScreenName></Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: safeTop, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text, flex: 1, textAlign: 'center' }]}><ScreenName></Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
          />
        }
      >
        {error ? (
          <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.error, marginBottom: spacing.lg }}>
            <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
            <Button title="Попробовать снова" variant="outline" onPress={() => load()} style={{ marginTop: spacing.md }} />
          </Card>
        ) : null}

        {/* TODO: main content */}
        <FadeIn delay={0}>
          <Card>
            <Text style={[typography.body, { color: colors.textSecondary }]}>Экран в разработке</Text>
          </Card>
        </FadeIn>
      </ScrollView>

      {/* <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)}
                    reason="feature" navigation={navigation} /> */}
      {/* reason options: "feature" | "ai_limit" | "food_scan_limit" |
                         "programs_limit" | "history_limit" | "leaderboard" */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
});
```

## Step 4 — Add to AppNavigator

```bash
# Find the correct stack in AppNavigator.tsx
grep -n "WorkoutsStack\|NutritionStack\|ProfileStack" C:/Users/sevka/Desktop/1223/work/iron-gym/src/navigation/AppNavigator.tsx | head -20
```

1. Add import at top of `AppNavigator.tsx`:
```typescript
import { <ScreenName>Screen } from '../screens/<tab>/<ScreenName>Screen';
```

2. Add screen to the correct stack Navigator:
```typescript
<Stack.Screen name="<ScreenName>" component={<ScreenName>Screen} />
```

## Step 5 — TypeScript Verification

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym && npx tsc --noEmit 2>&1
```

Must be clean before reporting done.

## Step 6 — Report

```
SCREEN CREATED:
- File: src/screens/<tab>/<ScreenName>Screen.tsx
- Navigator: <tab> stack as "<ScreenName>"
- Premium gate: [yes/no — which condition]
- Navigate to it: navigation.navigate('<ScreenName>', { params })
- TODO: [list of things left to implement]
- TypeScript: clean
```
