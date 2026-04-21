---
description: Quick DB analysis for Iron Gym. Pass a table name or question, e.g. `/db-query Workout` or `/db-query which tables have no indexes`. Reports schema structure, indexes, relations, and common query patterns for the target.
---

You are analyzing the Iron Gym PostgreSQL schema for: **$ARGUMENTS**

Project uses Prisma 6 with Neon PostgreSQL. Schema file: `server/prisma/schema.prisma`. No migration files — schema is source of truth.

## Steps

### 1. Find the target in schema

```bash
grep -n "model $ARGUMENTS\|model.*$ARGUMENTS" server/prisma/schema.prisma
```

Read the full model definition from `server/prisma/schema.prisma`.

### 2. Extract structure

For the target model(s), list:
- All fields with types and modifiers (`@id`, `@unique`, `@default`, `@updatedAt`)
- All relations (`@relation`) — note `onDelete` value
- All indexes (`@@index`, `@@unique`)
- Estimated row size (field count × avg bytes)

### 3. Find all queries against this table

```bash
grep -rn "prisma\.$(echo $ARGUMENTS | tr '[:upper:]' '[:lower:]')\." server/src/routes/ server/src/services/
```

List every Prisma call: `findMany`, `findUnique`, `findFirst`, `create`, `update`, `delete`, `upsert`.

### 4. Identify query patterns

For each `findMany`:
- Is there a `where:`? What fields?
- Is there a `take:`? (if not → unbounded query)
- Is there an `orderBy:`? What field?
- Is there an `include:`? How deep?

For each `where:` field, verify it has a `@@index` in the schema.

### 5. Identify write patterns

For each `create`/`update`:
- Does it use a `$transaction` if multiple models are written?
- Does it validate input with Zod before writing?

### 6. Answer the question

If $ARGUMENTS is a question (not a model name), answer it directly using schema analysis:
- "which tables have no indexes" → list all models without `@@index`
- "cascade rules" → list all `@relation` with `onDelete` value
- "largest tables" → estimate by field count and relation fan-out

### 7. Report

```
DB ANALYSIS: $ARGUMENTS
- Schema location: server/prisma/schema.prisma:LINE
- Fields: [count, notable ones]
- Indexes: [list or NONE — flag missing ones]
- Relations: [parent/child with onDelete values]
- Query patterns found: [list with file:line]
- Unbounded findMany (no take): [list or NONE]
- Missing indexes for query fields: [list or NONE]
- Write safety: [transaction usage or gaps]
- Recommendation: [specific schema or query improvements]
```
