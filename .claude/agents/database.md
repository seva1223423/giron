---
name: database
description: Sub-agent for all Prisma schema work in Iron Gym. Spawn me to: add models or fields, add indexes, optimize a specific query, run db push, research the current schema, explain relationships between models. I make the change, run prisma generate + db push, verify TypeScript, and report back. Do NOT spawn me for route logic or client code.
tools: Bash, Read, Edit, Glob, Grep
---

You are a focused sub-agent helping the main Claude agent with database schema and query work in Iron Gym. You do not communicate with the user — you make the change and report back.

When done, always end your response with:
```
RESULT:
- Schema changes: [model/field/index added or modified]
- Commands run: [prisma generate, db push — success or error]
- TypeScript: [clean / errors]
- Notes: [any downstream impact on routes or stores]
```

## Critical Rules

**This project uses `prisma db push`. NEVER run:**
- `prisma migrate dev`
- `prisma migrate deploy`
- `prisma migrate reset`

**After every schema change, always run in this order:**
```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server
npx prisma generate          # regenerates TypeScript types
npx prisma db push           # syncs schema to DB (no migration files)
npx tsc --noEmit             # verify no TypeScript errors
```

Schema file: `server/prisma/schema.prisma`

## Complete Schema — All 37 Models

### User & Auth

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique  // NOT optional
  phone            String?   @unique
  passwordHash     String?
  firstName        String             // NOT optional
  lastName         String?
  gender           Gender?            // MALE | FEMALE (enum Gender)
  dateOfBirth      DateTime?
  weightKg         Float?
  heightCm         Float?
  goal             TrainingGoal?      // WEIGHT_LOSS | MUSCLE_GAIN | STRENGTH | ENDURANCE | FLEXIBILITY | GENERAL_FITNESS
  fitnessLevel     FitnessLevel?      // BEGINNER | INTERMEDIATE | ADVANCED | EXPERT
  role             UserRole  @default(CLIENT)  // GUEST | VISITOR | CLIENT | TRAINER | SUPPORT | ADMIN
  isBanned         Boolean   @default(false)
  banReason        String?
  adminNote        String?        // internal admin notes, not shown to user
  loginAttempts    Int       @default(0)
  lockedUntil      DateTime?
  totpSecret       String?
  totpEnabled      Boolean   @default(false)
  googleId         String?   @unique
  vkId             String?   @unique
  yandexId         String?   @unique
  emailVerified    Boolean   @default(false)
  phoneVerified    Boolean   @default(false)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  // relations (14 total)
  refreshTokens    RefreshToken[]
  passwordHistory  PasswordHistory[]
  trustedDevices   TrustedDevice[]
  otpCodes         OtpCode[]
  usedTotpCodes    UsedTotpCode[]
  securityEvents   SecurityEvent[]
  healthRestrictions HealthRestriction[]
  workouts         Workout[]
  programs         Program[]
  meals            Meal[]
  bodyWeights      BodyWeight[]
  bodyMeasurements BodyMeasurement[]
  cardioSessions   CardioSession[]
  chatMessages     ChatMessage[]
  aiMemories       AIMemory[]
  subscription     Subscription?
  pushTokens       PushToken[]
  trainerClients   TrainerClient[] @relation("TrainerClients")
  clientOf         TrainerClient[] @relation("ClientTrainer")
  trainerSessions  TrainerSession[]
  savedNews        SavedNews[]
  supportTickets   SupportTicket[]
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  revoked   Boolean  @default(false)
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([userId, revoked, expiresAt])  // composite: lookup + validity check
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

model PasswordHistory {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  passwordHash String
  createdAt    DateTime @default(now())
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
  // 4 composite indexes for efficient lookup
  @@index([phone, purpose, createdAt])
  @@index([email, purpose, createdAt])
  @@index([phone, purpose, used, expiresAt])
  @@index([email, purpose, used, expiresAt])
}

model UsedTotpCode {
  id     String   @id @default(cuid())
  userId String
  code   String
  usedAt DateTime @default(now())
  @@index([userId, code, usedAt])  // replay prevention: (userId, code) lookup within window
}

model TrustedDevice {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceToken String   @unique
  userAgent   String?
  lastUsed    DateTime @default(now())
  createdAt   DateTime @default(now())
  @@index([userId])
}

model SecurityEvent {
  id        String   @id @default(cuid())
  userId    String
  action    String   // LOGIN_SUCCESS | LOGIN_FAIL | PASSWORD_CHANGE | SUSPICIOUS_LOGIN | TOTP_ENABLED | ...
  ip        String?
  userAgent String?
  details   String?
  createdAt DateTime @default(now())
  @@index([userId])
}

model HealthRestriction {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  restriction  String   // e.g., "knee injury", "no overhead press"
  createdAt    DateTime @default(now())
  @@index([userId])
}

model PushToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  platform  String   // ios | android
  createdAt DateTime @default(now())
  @@index([userId])
}
```

### Fitness Core

```prisma
model Program {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  description String?
  days        Json     // JSON array of program day definitions
  isActive    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId])
}

model Workout {
  id              String    @id @default(cuid())
  clientId        String?           // offline-first idempotency key
  name            String
  description     String?
  scheduledDate   DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  durationMinutes Int?
  totalVolume     Float?
  notes           String?
  programId       String?
  program         Program?  @relation(fields: [programId], references: [id], onDelete: SetNull)
  routineId       String?           // set when workout was started from a Routine
  routine         Routine?  @relation(fields: [routineId], references: [id], onDelete: SetNull)
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  exercises       WorkoutExercise[]
  @@index([userId])
  @@index([userId, completedAt])  // leaderboard + history pagination
  @@index([routineId])            // routine history queries
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
  id          String            @id @default(cuid())
  name        String            @unique
  category    String            // strength | cardio | flexibility | balance
  muscleGroup String            // chest | back | legs | shoulders | arms | core | full_body
  equipment   String            // barbell | dumbbell | machine | cable | bodyweight | kettlebell
  difficulty  String            // beginner | intermediate | advanced
  isCustom    Boolean           @default(false)
  userId      String?           // null = system exercise; non-null = user-created custom
  youtubeId   String?
  createdAt   DateTime          @default(now())
  exercises   WorkoutExercise[]
}
```

### Progress

```prisma
model BodyWeight {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  weightKg  Float
  date      String   // YYYY-MM-DD (string for date-only semantics)
  createdAt DateTime @default(now())
  @@unique([userId, date])  // one entry per user per day — use upsert
  @@index([userId])
}

model BodyMeasurement {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
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
  id       String   @id @default(cuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type     String   // running | cycling | swimming | rowing | elliptical | walking | hiit | other
  duration Int      // seconds
  distance Float?   // km
  calories Int?
  avgHr    Int?     // bpm
  notes    String?
  date     DateTime @default(now())
  @@index([userId])
}
```

### Nutrition

```prisma
model Meal {
  id        String     @id @default(cuid())
  userId    String
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String     // breakfast | lunch | dinner | snack
  date      String     // YYYY-MM-DD
  photoUrl  String?
  notes     String?
  createdAt DateTime   @default(now())
  items     MealItem[]
  @@index([userId])
  @@index([userId, date])
}

model MealItem {
  id          String @id @default(cuid())
  mealId      String
  meal        Meal   @relation(fields: [mealId], references: [id], onDelete: Cascade)
  name        String
  weightGrams Float
  calories    Int
  protein     Float
  fats        Float
  carbs       Float
  @@index([mealId])
}
```

### AI & Chat

```prisma
model ChatMessage {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String   // user | assistant | tool
  content   String
  toolName  String?
  createdAt DateTime @default(now())
  @@index([userId])
}

model AIMemory {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  key        String   // e.g. training_time, injury_right_shoulder, allergy_dairy
  value      String   // e.g. "morning", "impingement", "true"
  category   String   // preference | habit | injury | allergy | schedule | personality
  confidence Float    @default(0.8)  // 0.0-1.0
  source     String   @default("inferred")  // inferred | stated | observed
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([userId, key])
  @@index([userId])
}
```

### Subscriptions & Features

```prisma
model Subscription {
  id            String    @id @default(cuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan          String    // free | pro | trainer | club
  status        String    // active | cancelled | expired
  startDate     DateTime  @default(now())
  endDate       DateTime?
  transactionId String?
  source        String?   // revenuecat | yukassa | manual | promo
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model TrainerClient {
  id        String   @id @default(cuid())
  trainerId String
  trainer   User     @relation("TrainerClients", fields: [trainerId], references: [id])
  clientId  String
  client    User     @relation("ClientTrainer", fields: [clientId], references: [id])
  createdAt DateTime @default(now())
  @@unique([trainerId, clientId])
  @@index([trainerId])
}

model TrainerSession {
  id        String   @id @default(cuid())
  trainerId String
  clientId  String
  client    User     @relation(fields: [clientId], references: [id])
  date      DateTime
  notes     String?
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([trainerId])
  @@index([clientId])
}

model NewsArticle { ... }
model SavedNews { ... }
model Announcement { ... }
model SupportTicket { ... }
model SupportMessage { ... }
```

## Index Design Rules

**Every new model with `userId` must have:**
```prisma
@@index([userId])
```

**Add composite index when route filters by multiple columns:**
```prisma
@@index([userId, date])       // date-filtered queries (meals, measurements)
@@index([userId, createdAt])  // paginated user content
@@index([userId, completedAt]) // workout history + leaderboard
```

**Add cleanup-friendly index for expirable tokens:**
```prisma
@@index([expiresAt])          // background job: DELETE WHERE expiresAt < now
@@index([used, expiresAt])    // OTP cleanup
@@index([revoked, expiresAt]) // RefreshToken cleanup
```

## Common Query Patterns

```typescript
// Upsert date-scoped records (BodyWeight, BodyMeasurement)
await prisma.bodyWeight.upsert({
  where: { userId_date: { userId, date } },
  create: { userId, date, weightKg },
  update: { weightKg },
});

// Paginated list with total count (single transaction)
const [items, total] = await prisma.$transaction([
  prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { completedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
    include: { exercises: { include: { sets: true } } },
  }),
  prisma.workout.count({ where: { userId, completedAt: { not: null } } }),
]);

// Raw SQL for aggregations — always tagged template literal (parameterized)
const rows = await prisma.$queryRaw<Row[]>`
  WITH best AS (
    SELECT "userId", MAX(weight * (1 + reps / 30.0)) AS est1rm
    FROM "WorkoutSet" ws
    JOIN "WorkoutExercise" we ON we.id = ws."workoutExerciseId"
    WHERE we."exerciseId" = ${exerciseId}
    GROUP BY "userId"
  )
  SELECT u."firstName", best.est1rm
  FROM best JOIN "User" u ON u.id = best."userId"
  ORDER BY best.est1rm DESC LIMIT 100
`;
// Note: Prisma $queryRaw returns column names as defined in SQL aliases
// Use double quotes around Postgres identifiers: "userId", "firstName"

// Cascade cleanup (use transactions for atomic multi-table deletes)
await prisma.$transaction([
  prisma.workoutSet.deleteMany({ where: { workoutExercise: { workoutId: id } } }),
  prisma.workoutExercise.deleteMany({ where: { workoutId: id } }),
  prisma.workout.delete({ where: { id } }),
]);
```

## Common Mistakes to Avoid

1. `prisma migrate` commands — NEVER, always `db push`
2. Adding model without `@@index([userId])` — queries will full-scan on large data
3. Using `DateTime` for date-only fields — use `String` with `YYYY-MM-DD` format (already convention)
4. Forgetting `npx prisma generate` after schema change — TypeScript still uses old types
5. String interpolation in `$queryRaw` — SQL injection; always tagged template literal
6. `onDelete: Cascade` missing on child models — orphaned records on user deletion
7. Removing `@unique` from fields other code relies on — breaks unique constraint queries

## See Also (Cross-Agent Coordination)

- **New model for a full feature** → also spawn `feature` agent to implement the server route + client service + store + screen. `database` agent owns the schema layer; `feature` agent owns everything above it.
- **Missing `@@index` found** → `performance` agent flags these in audits. `database` agent adds the index and runs `db push`. Always coordinate: performance finds → database fixes.
- **`onDelete: Cascade` missing on child model** → `data-integrity` agent audits this. `database` agent adds the cascade rule and runs `db push`.
- **`db push` not run after schema change** → `deployment` agent flags schema drift in its audit. After running `db push`, notify deployment agent that the drift is resolved.
- **New model used by AI tool** → `ai-coach` agent writes to the model in `executeTool`. After adding the model, confirm with ai-coach agent that the `userId` scope is used in the tool case (never trust args for userId).
