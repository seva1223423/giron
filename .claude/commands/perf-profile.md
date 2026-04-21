---
description: Profile a specific Iron Gym endpoint. Pass the route path as argument, e.g. `/perf-profile /workouts/leaderboard`. Reports query count, estimated latency, N+1 risks, cache coverage, and payload size.
---

You are profiling a specific Iron Gym server endpoint for performance. The endpoint to profile is: **$ARGUMENTS**

If no argument is provided, ask which endpoint to profile.

## Profiling Steps

### 1. Locate the handler

```bash
grep -n "router\.\(get\|post\|put\|delete\).*$ARGUMENTS\|'$ARGUMENTS'\|\"$ARGUMENTS\"" server/src/routes/*.ts
```

Read the matching route file and find the handler for this path.

### 2. Count DB queries

Count every `await prisma.` call inside the handler (including calls to helper functions it invokes). Classify:
- Sequential queries (blocking chain: A → wait → B) — worst for latency
- Parallel queries (`Promise.all`) — better, but still N round-trips
- Single queries with `include:` — best for relational data

### 3. Detect N+1

Look for any loop containing a `prisma.*` call:
```typescript
// BAD — N queries
for (const item of items) {
  await prisma.something.findUnique(...)
}

// ALSO BAD — N sequential awaits
const a = await prisma.A.findUnique(...)
const b = await prisma.B.findUnique(...)  // no dependency on a
```

### 4. Check cache

```bash
grep -n "cache\|Cache\|get(\|set(" server/src/routes/$(basename $(grep -l "$ARGUMENTS" server/src/routes/*.ts)))
```

Is this endpoint's response cached? What's the TTL? Is the cache key per-user or shared?

### 5. Check payload size

```bash
grep -n "include:\|select:" server/src/routes/$(basename $(grep -l "$ARGUMENTS" server/src/routes/*.ts)) | grep -A5 -B5 "$ARGUMENTS"
```

Does the response include nested arrays (sets[], exercises[], items[])? Estimate row count × fields.

### 6. Check indexes

```bash
grep -n "@@index\|@unique" server/prisma/schema.prisma
```

For every `where:` field in the handler, verify it has a `@@index` in schema.

### 7. Report

```
PROFILE: $ARGUMENTS
- Handler location: file:line
- DB query count: X sequential + Y parallel = Z total round-trips
- Estimated baseline latency: Xms (Neon cold: +200ms, warm: ~20ms/query)
- N+1 issues: [description + file:line] or NONE
- Cache: [HIT path exists / MISS always / not cached]
- Payload risk: [describe nested includes or large arrays]
- Missing indexes: [field + model] or NONE
- Optimization priority: CRITICAL / HIGH / MEDIUM / LOW
- Recommended fix: [specific change for main agent to implement]
```
