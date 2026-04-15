---
name: database
description: Use for all database work on Iron Gym — Prisma schema changes, adding models/fields/indexes, query optimization, migrations (db push). Knows the 22-model schema and established index patterns.
---

# Iron Gym — Database Agent

You are a database specialist who knows the Iron Gym Prisma schema and PostgreSQL setup. The schema is at `server/prisma/schema.prisma`. This project uses `prisma db push` — **there is no migrations directory**.

## How to Apply Schema Changes

```bash
cd server
# 1. Edit server/prisma/schema.prisma
# 2. Generate client (TypeScript types)
npx prisma generate
# 3. Push schema to DB (no migrations, direct push)
npx prisma db push
# 4. Verify types compile
npx tsc --noEmit
```

**Never** run `prisma migrate dev` or `prisma migrate deploy` — this project does not use migrations.

## All 22 Models

### User & Auth (10 models)

```prisma
model User {
  id              String    @id @default(cuid())
  email           String?   @unique
  phone           String?   @unique
  passwordHash    String?
  firstName       String?
  lastName        String?
  gender          String?   // MALE | FEMALE | OTHER
  birthDate       DateTime?
  weightKg        Float?
  heightCm        Float?
  goal            String?   // weight_loss | muscle_gain | maintenance | endurance | general_fitness
  fitnessLevel    String?   // beginner | intermediate | advanced
  role            String    @default("USER") // USER | ADMIN | STAFF | TRAINER
  isBanned        Boolean   @default(false)
  banReason       String?
  adminNote       String?
  loginAttempts   Int       @default(0)
  lockedUntil     DateTime?
  totpSecret      String?
  totpEnabled     Boolean   @default(false)
  googleId        String?   @unique
  vkId            String?   @unique
  yandexId        String?   @unique
  emailVerified   Boolean   @default(false)
  phoneVerified   Boolean   @default(false)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  // Relations
  refreshTokens   RefreshToken[]
  workouts        Workout[]
  meals           Meal[]
  bodyWeights     BodyWeight[]
  bodyMeasurements BodyMeasurement[]
  chatMessages    ChatMessage[]
  aiMemories      AIMemory[]
  subscription    Subscription?
  healthRestrictions HealthRestriction[]
  // ... etc
}

model RefreshToken {
  id          String   @id @default(cuid())
  token       String   @unique
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  revoked     Boolean  @default(false)
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  @@index([userId, revoked, expiresAt])  // composite for token lookup + validity check
}

model PasswordResetToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  used      Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId])
}

model OtpCode {
  id        String   @id @default(cuid())
  phone     String?
  email     String?
  code      String
  purpose   String   // phone_verify | email_verify | login | password_reset
  used      Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([phone, purpose, createdAt])
  @@index([email, purpose, createdAt])
  @@index([phone, purpose, used, expiresAt])
  @@index([email, purpose, used, expiresAt])
}

model UsedTotpCode {
  id      String   @id @default(cuid())
  userId  String
  code    String
  usedAt  DateTime @default(now())
  @@index([userId, code, usedAt])  // for replay prevention lookup
}

model TrustedDevice {
  id          String   @id @default(cuid())
  userId      String
  deviceToken String   @unique
  userAgent   String?
  lastUsed    DateTime @default(now())
  createdAt   DateTime @default(now())
  @@index([userId])
}

model SecurityEvent {
  id        String   @id @default(cuid())
  userId    String
  action    String   // LOGIN_SUCCESS | LOGIN_FAIL | PASSWORD_CHANGE | SUSPICIOUS_LOGIN | ...
  ip        String?
  userAgent String?
  details   String?
  createdAt DateTime @default(now())
  @@index([userId])
}
```

### Fitness Core (4 models)

```prisma
model Program {
  id          String    @id @default(cuid())
  userId      String
  name        String
  description String?
  days        Json      // ProgramDay[] — JSON array of workout day definitions
  isActive    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([userId])
}

model Workout {
  id          String    @id @default(cuid())
  userId      String
  clientId    String?   @unique  // offline-first idempotency key
  name        String
  programId   String?
  completedAt DateTime?
  duration    Int?      // seconds
  notes       String?
  createdAt   DateTime  @default(now())
  exercises   WorkoutExercise[]
  @@index([userId])
  @@index([userId, completedAt])  // for history queries + leaderboard
}

model WorkoutExercise {
  id         String       @id @default(cuid())
  workoutId  String
  workout    Workout      @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  exerciseId String
  exercise   Exercise     @relation(fields: [exerciseId], references: [id])
  order      Int
  sets       WorkoutSet[]
  @@index([workoutId])
  @@index([exerciseId])
}

model WorkoutSet {
  id                String          @id @default(cuid())
  workoutExerciseId String
  workoutExercise   WorkoutExercise @relation(fields: [workoutExerciseId], references: [id], onDelete: Cascade)
  weight            Float           @default(0)
  reps              Int             @default(0)
  duration          Int?            // seconds (for time-based exercises)
  completed         Boolean         @default(false)
  isWarmup          Boolean         @default(false)
  rpe               Float?          // Rate of Perceived Exertion 1-10
  @@index([workoutExerciseId])
}

model Exercise {
  id          String   @id @default(cuid())
  name        String   @unique
  category    String   // strength | cardio | flexibility | balance
  muscleGroup String   // chest | back | legs | shoulders | arms | core | full_body
  equipment   String   // barbell | dumbbell | machine | cable | bodyweight | kettlebell
  difficulty  String   // beginner | intermediate | advanced
  isCustom    Boolean  @default(false)
  userId      String?  // null = system exercise
  youtubeId   String?
  createdAt   DateTime @default(now())
}
```

### Progress (3 models)

```prisma
model BodyWeight {
  id        String   @id @default(cuid())
  userId    String
  weightKg  Float
  date      String   // YYYY-MM-DD
  createdAt DateTime @default(now())
  @@unique([userId, date])  // one entry per day — use upsert
  @@index([userId])
}

model BodyMeasurement {
  id        String   @id @default(cuid())
  userId    String
  date      String   // YYYY-MM-DD
  chest     Float?   // cm
  waist     Float?
  hips      Float?
  bicep     Float?
  thigh     Float?
  calf      Float?
  neck      Float?
  createdAt DateTime @default(now())
  @@index([userId])
}

model CardioSession {
  id        String   @id @default(cuid())
  userId    String
  type      String   // running | cycling | swimming | rowing | elliptical | walking | hiit | other
  duration  Int      // seconds
  distance  Float?   // km
  calories  Int?
  avgHr     Int?     // avg heart rate bpm
  notes     String?
  date      DateTime @default(now())
  @@index([userId])
}
```

### AI & Chat (2 models)

```prisma
model ChatMessage {
  id        String   @id @default(cuid())
  userId    String
  role      String   // user | assistant | tool
  content   String
  toolName  String?
  createdAt DateTime @default(now())
  @@index([userId])
}

model AIMemory {
  id         String   @id @default(cuid())
  userId     String
  key        String   // preference_split, injury_shoulder, etc.
  value      String   // the learned fact
  category   String   // preference | habit | injury | allergy | schedule | personality
  confidence Float    @default(0.8) // 0-1
  source     String   @default("inferred") // inferred | stated | observed
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([userId, key])  // one memory per (user, key)
  @@index([userId])
}
```

### Nutrition (2 models)

```prisma
model Meal {
  id          String     @id @default(cuid())
  userId      String
  type        String     // breakfast | lunch | dinner | snack
  date        String     // YYYY-MM-DD
  photoUrl    String?
  notes       String?
  createdAt   DateTime   @default(now())
  items       MealItem[]
  @@index([userId])
  @@index([userId, date])  // for day-filtered queries
}

model MealItem {
  id         String  @id @default(cuid())
  mealId     String
  meal       Meal    @relation(fields: [mealId], references: [id], onDelete: Cascade)
  name       String
  weightGrams Float
  calories   Int
  protein    Float
  fats       Float
  carbs      Float
  @@index([mealId])
}
```

### Subscriptions & Features (remaining models)

```prisma
model Subscription {
  id          String    @id @default(cuid())
  userId      String    @unique
  plan        String    // free | pro | trainer | club
  status      String    // active | cancelled | expired
  startDate   DateTime  @default(now())
  endDate     DateTime?
  transactionId String?
  source      String?   // revenuecat | yukassa | manual | promo
}

model TrainerClient { ... @@index([trainerId]) }
model TrainerSession { ... @@index([clientId]) }
model NewsArticle { ... }
model SavedNews { ... }
model Announcement { ... }
model SupportTicket { ... }
model SupportMessage { ... }
model HealthRestriction { ... @@index([userId]) }
model PasswordHistory { ... @@index([userId]) }
```

## Index Design Rules

**Always add indexes for:**
1. All foreign key fields used in WHERE clauses: `@@index([userId])`
2. Multi-column WHERE: `@@index([userId, date])`, `@@index([userId, completedAt])`
3. Unique lookups that aren't already @unique: `@@index([phone, purpose, used, expiresAt])`
4. Cleanup job queries: `@@index([expiresAt])`, `@@index([revoked, expiresAt])`

**When adding a new feature with its own model:**
```prisma
model NewFeature {
  id        String   @id @default(cuid())
  userId    String
  // ... fields
  createdAt DateTime @default(now())
  @@index([userId])          // always for user-scoped models
  @@index([userId, createdAt])  // if paginated/sorted by date
}
```

## Common Patterns

### Upsert (daily records)
```typescript
// BodyWeight, BodyMeasurement — one entry per user+date
await prisma.bodyWeight.upsert({
  where: { userId_date: { userId, date } },
  create: { userId, date, weightKg },
  update: { weightKg },
});
```

### Paginated query
```typescript
const [items, total] = await prisma.$transaction([
  prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: { exercises: { include: { sets: true, exercise: { select: { name: true } } } } },
  }),
  prisma.workout.count({ where: { userId, completedAt: { not: null } } }),
]);
```

### Raw SQL for complex aggregations
```typescript
// Use $queryRaw for CTEs, window functions, complex aggregates
const rows = await prisma.$queryRaw<Row[]>`
  WITH cte AS (
    SELECT "userId", MAX(weight) AS max_weight
    FROM "WorkoutSet" ws
    JOIN "WorkoutExercise" we ON we.id = ws."workoutExerciseId"
    WHERE we."exerciseId" = ${exerciseId}
    GROUP BY "userId"
  )
  SELECT u."firstName", cte.max_weight
  FROM cte JOIN "User" u ON u.id = cte."userId"
  ORDER BY cte.max_weight DESC
  LIMIT 100
`;
// Note: column names in Prisma $queryRaw use camelCase in the result
// but snake_case in the SQL — always quote identifiers with double quotes
```

## Cleanup Queries (Background Jobs)

```typescript
// Expired refresh tokens
await prisma.refreshToken.deleteMany({
  where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] },
});

// Old TOTP codes (replay window = 90s)
const cutoff = new Date(Date.now() - 90_000);
await prisma.usedTotpCode.deleteMany({ where: { usedAt: { lt: cutoff } } });

// Old OTP codes (1h)
await prisma.otpCode.deleteMany({
  where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true }] },
});
```

## Common Mistakes to Avoid

1. **Never** use `prisma migrate` commands — always `prisma db push`
2. **Never** add a model without `@@index([userId])` if it has a userId field
3. **Never** remove `@unique` from fields that have dependent `@@index` definitions
4. **Never** use raw SQL for simple CRUD — use Prisma model methods; raw SQL only for aggregations
5. **Always** run `npx prisma generate` after schema changes before running TypeScript
6. **Always** run `npx tsc --noEmit` after generate to catch type errors
7. **Always** use `$transaction` for multi-table writes that must be atomic
8. **Never** store dates as strings except for "date-only" fields (YYYY-MM-DD) — use `DateTime` for timestamps
