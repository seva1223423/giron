---
description: Add a new Prisma model to Iron Gym. Argument: "ModelName description" — e.g. "WorkoutNote User notes attached to a workout session". Handles schema, generate, required indexes, cascade rules, and TS type. Does NOT run db push (requires user approval for production).
---

You are adding a new Prisma model to Iron Gym's database schema. Argument: **$ARGUMENTS**

Parse: `<ModelName>` (PascalCase) and a description of what it stores.

**Schema file:** `C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma`

## Step 1 — Verify Model Doesn't Exist

```bash
grep "^model <ModelName>" C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma
```

If it exists, stop and report.

## Step 2 — Design the Model

Consider:
- Does it belong to a User? → `userId String`, `user User @relation(...)`, `@@index([userId])`
- Does it have a date filter? → `@@index([userId, createdAt])` or `@@index([userId, date])`
- Are child records cleaned up when parent is deleted? → `onDelete: Cascade` (almost always yes for user-owned data)
- Is there a uniqueness constraint? → `@@unique([userId, someField])`
- String vs DateTime: use `String` for date-only fields (format `YYYY-MM-DD`), `DateTime` for timestamps

## Step 3 — Add Model to Schema

Find the end of the schema file or the appropriate section:
```bash
tail -20 C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma
```

Add the new model following this pattern:
```prisma
model <ModelName> {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // domain fields here
  value     Int
  note      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([userId, createdAt])  // add if queried by date
}
```

Also add the reverse relation to the `User` model:
```prisma
// Inside model User { ... }
myModels  <ModelName>[]
```

## Step 4 — Run prisma generate

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx prisma generate
```

This regenerates Prisma Client TypeScript types. Does NOT touch the DB.

## Step 5 — TypeScript Check

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx tsc --noEmit 2>&1
```

Must be clean before proceeding.

## Step 6 — Add TypeScript Type to Client (if client needs it)

In `src/types/index.ts`, add the interface:
```typescript
export interface <ModelName> {
  id: string;
  userId: string;
  // domain fields
  createdAt: string;
}
```

## Step 7 — CRITICAL: Report db push is Needed

```
MODEL ADDED:
- Model: <ModelName>
- Schema: server/prisma/schema.prisma
- Indexes: [list]
- Cascade: [onDelete rule on userId relation]
- TypeScript: clean (generate ran)

⚠️  IMPORTANT — db push NOT run yet:
Run manually when ready:
  cd server && npx prisma db push

Without this, any route writing to <ModelName> will get P2021 (table not found) in production.
```

## Checklist — Never Skip These

- [ ] `@id @default(cuid())` — all models need a string primary key
- [ ] `@@index([userId])` — required on every user-owned model
- [ ] `onDelete: Cascade` — required on `userId` relation for user-owned models
- [ ] Reverse relation added to `User` model
- [ ] `npx prisma generate` run
- [ ] `npx tsc --noEmit` clean
- [ ] User warned that `db push` is still needed
