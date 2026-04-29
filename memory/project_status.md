---
name: Project Status & All Ideas
description: Полный статус проекта, все идеи и задачи обсуждённые за всё время работы
type: project
---

## Что уже сделано

### Инфраструктура
- `CLAUDE.md` — контекстный файл проекта, автозагружается Claude Code
- Memory система в `~/.claude/projects/.../memory/` + дублирование в репозитории
- `README.md` — подробный briefing для будущих сессий Claude
- Singleton PrismaClient в `server/src/db.ts` — исправлена утечка инстансов
- Structured logger `server/src/utils/logger.ts` — LOG_LEVEL env var, production дефолт 'warn'
- Все `console.*` → `logger.*` по серверу
- `unhandledRejection` + `uncaughtException` guards в `server/src/index.ts`
- Rate limiting (express-rate-limit) на auth/user/workouts/nutrition/ai/news/subscription/trainer/cardio/support/admin
- Helmet middleware
- CI: `.github/workflows/server-tests.yml` — tsc --noEmit + jest при push в server/**

### Безопасность (hardened)
- JWT с issuer/audience claims, refresh token rotation, replay protection
- Account lockout: 5 failed logins → 15 min
- TOTP 2FA с UsedTotpCode для защиты от replay
- Timing-safe OTP comparison, TOCTOU guards в change-email/phone
- DeviceToken persistence, logout-all-devices, trusted devices
- PasswordHistory для предотвращения reuse
- SecurityEvent логирование

### Сервер — фичи
- **Routines API (2026-04)** — routineId FK on Workout (SetNull on delete), PUT /routines/:id, POST /routines/:id/start с progressive overload (+2.5кг), GET /routines/:id/history; P2003 graceful fallback in POST /sync
- **Test suite (2026-04)** — 19 server integration suites (445 tests, все 11 маршрутов покрыты), 29 client unit suites (512 tests, все 13 Zustand-сторов покрыты)
- **Trainer API** — CRUD клиентов + сессий
- **Autosave endpoint** `POST /workouts/:id/autosave` — каждые 30s
- **Zod валидация** на всех маршрутах
- **AI insights timeout** — AbortController 12s + fallback
- **Forgot/reset password** — полная реализация (email + SMS), rate limited
- **Admin API** — users, subscriptions, logs, security events, support, analytics, announcements
- **Support** — тикеты с сообщениями
- **Cardio** — CRUD кардио-сессий

### Клиент — фичи
- **Routines UI (2026-04)** — RoutineDetailScreen: estimated duration stat, exercise reorder (▲▼ in edit mode), exercise picker modal (add exercises from library), optimistic remove/reorder with rollback; RoutinesListScreen: sort by last used; QuickStartTab: "Мои рутины" horizontal scroll + "All →" link; HomeScreen: fixed stale navigation target WorkoutsTab→WorkoutsList
- **useTrainerStore** — оптимистичные обновления + rollback
- **Autosave тренировки**
- **Admin screens** (11 экранов): Dashboard, Analytics, Announcements, Logs, SecurityEvents, Subscriptions, Support, Ticket, UserDetail, Users
- **ForgotPasswordScreen + ResetPasswordScreen** — полная реализация
- **Barcode scanner** для еды
- **Food scanner** с AI-распознаванием
- **Body measurements, sleep tracker, cardio** — полностью

### Рефакторинг экранов — ЗАВЕРШЕНО
Все большие экраны отрефакторены через паттерн "оркестратор + components/":

| Экран | Было | Стало |
|-------|------|-------|
| ProgressScreen | 1993 | 105 |
| HomeScreen | 970 | 232 |
| ActiveWorkoutScreen | 909 | 234 |
| WorkoutSummaryScreen | 908 | 195 |
| CustomWorkoutScreen | 756 | 49 |
| WorkoutsScreen | 738 | 43 |
| AIChatScreen | 631 | 332 |
| NutritionScreen | 627 | 108 |
| TrainerClientScreen | 603 | 336 |
| SettingsScreen | 558 | 53 |

---

## В процессе (незаконченное)

**`npx prisma db push` (производственная БД)** — схема уже обновлена в репо (routineId FK на Workout), но push на Neon (production DATABASE_URL) ещё не выполнен. Без этого GET /routines/:id/history и progressive overload возвращают пустые результаты. Команда: `cd server && npx prisma db push` с production DATABASE_URL в .env.

---

## Видео-подсистема упражнений

Отдельный pipeline для демонстрационных видео всех упражнений:

- **Пайплайн:** Wikimedia Commons → ffmpeg → bundled в APK.
  1. `scripts/fetch-exercise-videos-wikimedia.mjs` — без API-ключа, с de-dup по URL, token-overlap scoring, OFF_TOPIC blocklist. Сохраняет `videos-manifest.json` прогрессивно (для CC-BY attribution).
  2. `scripts/normalize-exercise-videos.mjs` — ffmpeg через `imageio-ffmpeg` pip-пакет: 854×480 H.264, 8 сек, silent AAC, +faststart, JPG-постер с 1-й секунды. Каждое видео ~300 KB.
  3. Файлы копируются в `assets/exercise-videos/` — bundled в APK. Отдельного медиа-репо больше нет: один репозиторий для кода и ассетов. Ранее использовался `seva1223423/iron-gym-media` с `raw.githubusercontent.com`, сейчас не нужен.
- **Whitelist:** 32 упражнения (`scripts/whitelist-verified.json` / `src/data/exerciseVideoAssets.ts` → `EXERCISE_VIDEO_ASSETS`) прошли визуальное QA. Остальные 79 падают на YouTube-fallback без попытки загрузки.
- **Размер APK:** +9 МБ за все верифицированные видео+постеры. Компромисс ради offline-воспроизведения.
- **Клиентские компоненты:**
  - `src/screens/workouts/exercise/ExerciseInlineVideo.tsx` — expo-video wrapper. Autoplay muted + loop, poster overlay до первого кадра, `paused` prop для external pause, proper player release в cleanup.
  - `ExerciseVideoCard` — авто-играющая карточка в деталях упражнения. Тап → fullscreen modal.
  - `ExerciseVideoModal` — fullscreen с `nativeControls=true` (OS-native scrubber + rotation/fullscreen).
  - Thumbnails добавлены в: ExercisesTab, ProgramDayCard, WorkoutSummary ExercisesCard, TodayPlanCard (overlapping stack для плана на сегодня), ExerciseNavBar в ActiveWorkoutScreen.
  - `Image.prefetch` в ExercisesTab — постеры прогреваются сразу после загрузки списка.

## Регуляторика РФ (для RuStore)

- `docs/privacy.html` — Политика под 152-ФЗ + GDPR, с плейсхолдерами под реквизиты ИП.
- `docs/terms.html` — Пользовательское соглашение с медицинским дисклеймером.
- `docs/LEGAL_RF_CHECKLIST.md` — чеклист: ИП → уведомление РКН → миграция БД на Yandex Cloud → ЮKassa → RuStore publisher.
- Settings → новая секция "Правовая информация" со ссылками и mailto.
- RegisterScreen → consent-строка под кнопкой.
- Возрастной гейт 14+ в onboarding (BodyStep + OnboardingScreen).
- AI-чат → постоянный медицинский дисклеймер в ChatHeader.
- RevenueCat удалён — для РФ не работает; оставлен только ЮKassa.
- Feature-flag `EXPO_PUBLIC_STORE` (`rustore|play|appstore|universal`) в `src/config/store.ts` — Google OAuth/YouTube/Apple IAP гейтятся per-store.

## Безопасность/производительность (hardening прошедшего аудита)

- `/user/2fa/setup` требует currentPassword при наличии passwordHash.
- `/user/profile` — явный `select` вместо `include + as any`.
- `/auth/forgot-password` fire-and-forget SMTP (timing enum fix).
- `/auth/resend-verification` унифицированный ответ.
- `/support/tickets/:id/assign` — проверка роли assignee.
- VK/Yandex OAuth fetch с `AbortSignal.timeout(5000)`.
- `recordPasswordHistory` — raw SQL DELETE ... NOT IN вместо fetch+delete.
- `admin.ts /analytics/*` — groupBy(timestamp) заменено на DATE_TRUNC raw SQL.
- `admin.ts /analytics/segments` — кэш 5 мин через adminStatsCache.
- `/user/export` — полный дамп данных (152-ФЗ право на переносимость).
- `workout.ts /programs /history` — `select` на Exercise relation (ответы в разы меньше).
- Push-уведомления SUSPICIOUS_LOGIN — убран raw IP из body.
- Клиент `api.ts`: timeout на refresh; `chatStream` читает токен из SecureStore; useWorkoutStore rollback не клобберит новый optimistic update.
- **Per-user AI rate limit (2026-04-22)** — `perUserAiBuckets` Map в `server/src/routes/ai.ts`. Лимит 30 req/min на userId (дополнительно к дневному лимиту 10 msgs/day для free users). Bucket prune через `.unref()` interval. 2 regression теста в `ai_security.test.ts` (BUG-AI-003).
- **Agent system improvements (2026-04-22)** — 2 новых команды (`test-store.md`, `test-route.md`) для scaffolding тестов; улучшены `monitoring.md` (cache invalidation table), `data-integrity.md` (offline ID upgrade pattern), `backend.md` (mock patterns), `security.md` (fix examples), `performance.md` (latency benchmarks), `release-prep.md` (Section 9), `audit-all.md` (Phase 1 extended), `sync-memory.md` (command/knowledge checks).
- **Health check DB ping (2026-04-22)** — `GET /health` upgraded: now calls `prisma.$queryRaw\`SELECT 1\`` and returns `503 { db: 'unreachable' }` if DB is down. Render marks service unhealthy correctly.
- **Validation test expansion (2026-04-22)** — `validation.test.ts` grown to 155 tests (was 43): cardio Zod schema (30 tests, replaced 4 manual checks), body measurements (11 tests), sleep/bedtime (14 tests), profile update (15 tests), nutrition targets (9 tests), routines (19 tests), registration strong password (13 tests: uppercase/lowercase/digit/min8/max128), login (5 tests: bcrypt DoS max 1000), meal schema tightened (photoUrl must be https, date field added). `cardio.test.ts` +7 boundary integration tests. Total server: 532 tests (all green).
- **Analytics context timing alerts (2026-04-22)** — `_t0ContextPrimary`/`_t0ContextSecondary` timestamps added around both `Promise.all` blocks in `server/src/routes/ai.ts`. `logger.warn` fires if either exceeds 2000ms (with userId). Closes last MEDIUM gap in monitoring.md.
- **Agent template fixes (2026-04-22)** — `makeToken` in backend.md, tests.md, test-route.md now includes `issuer`/`audience` (auth middleware verifies both; missing them = spurious 401s). `database.md` User model corrected: proper enum types (Gender/TrainingGoal/FitnessLevel/UserRole), non-nullable email, correct role default (CLIENT not USER). `docs.md` test baseline updated (410→532).
- **Client test expansion (2026-04-22)** — 555 client tests (was 512): `1rm.test.ts` expanded from 7→29 (added Brzycki, Lander, average formula, ONE_RM_PERCENTAGES table tests); `routinesStore.test.ts` 10→18 (added replaceRoutine, updateRoutineName with optimistic rollback, duplicateRoutine); `settingsStore.test.ts` 12→17 (added waterRemindersEnabled, reminderHour, resetToDefaults); `nutritionStore.test.ts` 12→20 (added updateMealItem, removeMealItem, applyServerTargets, clearUserData). All baselines updated across 8 agent/command/doc files.
- **Server trainer test expansion (2026-04-22)** — `trainer.test.ts` 15→37 tests: added PATCH /clients/:id (6 tests: 401, 400 bad CUID, 400 invalid lastVisit, 404 count=0, 200 updated client, SECURITY trainerId scope), GET /sessions/:clientId (5 tests: 401, 400, 404 ownership, 200 list, SECURITY findFirst filter), POST /sessions/:clientId (5 tests: 401, 400 clientId, 404 ownership, 400 validation, 201 creates), DELETE /sessions/:id (6 tests: 401, 400, 404 null, 404 wrong trainer, 200 atomic, SECURITY ownership via include). Added `trainerSession.findUnique` and `trainerSession.count` to Prisma mock. Total server: 554 tests.
- **Server admin test expansion (2026-04-22)** — `admin.test.ts` 23→47 tests: added GET /users/:id (3 tests: 401, 404, 200 strips passwordHash/totpSecret), PATCH /users/:id/subscription (4 tests: 401, 400 CUID, 400 invalid plan, 200 upsert+log), DELETE /users/:id (4 tests: 401, 400 self-delete, 404 NotFound, 200 anonymize+log), Announcements CRUD (16 tests: GET 401/200, POST 401/400/400/201, PATCH 400/404/200, DELETE 401/400/404/200). Added `announcement`, `workout`, `supportTicket` to Prisma mock. Total server: 578 tests.
- **Server auth test expansion (2026-04-22)** — `auth.test.ts` 24→35 tests: added POST /forgot-password (4 tests: 400 invalid email, 200 enumeration protection, 200 per-email rate limit, 200 creates token), POST /reset-password (5 tests: 400 missing token, 400 weak password, 400 invalid token, 400 expired token, 200 success), POST /logout (2 tests: 200 no body, 200 with refresh token). Fixed emailService mock (was missing `sendPasswordChangedAlert`, `sendOtpEmail`, `sendNewLoginAlert` — caused 500 in existing tests). Added `trustedDevice`, `passwordHistory.deleteMany`, `passwordResetToken.findFirst` to Prisma mock. Total server: 589 tests.
- **Server user test expansion (2026-04-22)** — `user.test.ts` 17→37 tests: added GET /weight (401, 200 history), POST /measurements (401, 400 invalid date, 400 value out of range, 200 upsert), GET /measurements (401, 200 capped at FREE_MEASUREMENTS_LIMIT=5 for free users), POST /sleep (401, 400 invalid bedtime format, 400 durationHours>24, 200 upsert), GET /sleep (401, 200 last 90), GET /trusted-devices (401, 200 list), DELETE /measurements/:date (401, 400 bad date, 404 not found, 200 success). Added `bodyMeasurement.upsert` to Prisma mock. Total server: 609 tests (all green).
- **Server workout test expansion (2026-04-22)** — `workout.test.ts` 23→33 tests: added POST /start (6 tests: 401, 400 invalid body, 400 P2003 FK violation "упражнений не найдены", 200 creates workout, 200 idempotency returns existing, SECURITY idempotency scoped by userId), POST /sync (4 tests: 401, 400 invalid finishedAt, 200 saves sets+marks complete, 200 partial sets). Added `workout.findFirst` and `program.findFirst` to Prisma mock. Total server: 619 tests (all green).
- **Server auth test expansion (2026-04-22)** — `auth.test.ts` 35→45 tests: added POST /check-email (3 tests: 200 not-found, 200 found+hasPassword/hasGoogle flags, 200 invalid email silently returns exists:false), POST /check-phone (2 tests: 200 not-found, 200 found), POST /verify-email (3 tests: 400 no active OTP, 400 wrong code with attempt tracking, 200 valid code marks emailVerified + SECURITY updateMany.where.email), POST /resend-verification (2 tests: 200 enumeration protection for unknown email, 200 sends OTP for unverified user). Added otpCode.count/create/updateMany and user.updateMany to Prisma mock. Total server: 662 tests (all green).
- **Server support test expansion (2026-04-22)** — `support.test.ts` 25→35 tests: added PATCH /tickets/:id/status (5 tests: 401, 403 USER via requireStaff, 400 bad CUID, 403 SUPPORT not assigned to ticket, 200 ADMIN updates any status) and PATCH /tickets/:id/assign (5 tests: 401, 400 bad CUID, 403 SUPPORT cannot assign, 400 assignee is regular USER, 200 ADMIN assigns to SUPPORT). Role-gate logic: requireStaff uses JWT role; inner admin-only check fetches actor from DB. Total server: 652 tests (all green).
- **Server workout test expansion 2 (2026-04-22)** — `workout.test.ts` 33→56 tests: added POST /:id/complete (5 tests: 401, 400 bad CUID, 404 IDOR wrong owner, 409 already-completed atomic guard, 200 completes + SECURITY updateMany scopes userId), POST /:id/autosave (4 tests: 401, 400 bad CUID, 404 IDOR, 200 fire-and-forget), GET /leaderboard (3 tests: 401, 402 free user SUBSCRIPTION_REQUIRED, 200 paid user $queryRaw), GET /routines (3 tests: 401, 200 list, SECURITY findMany userId), POST /routines (4 tests: 401, 400 missing name, 201 create, 400 P2003), GET /routines/:id (4 tests: 401, 400 bad CUID, 404 IDOR, 200 success). Added workout.updateMany, workoutSet, routine, $queryRaw to Prisma mock; imported getSubStatus for leaderboard override. Total server: 642 tests (all green).
- **Server user test expansion 2 (2026-04-22)** — `user.test.ts` 37→51 tests: added DELETE /sleep/:date (4 tests: 401, 400 bad format, 200 ok, 404 no entry), GET /has-password (3 tests: 401, 200 true, 200 false), GET /security-events (2 tests: 401, 200 returns array), GET /sessions (2 tests: 401, 200 scoped to user), DELETE /sessions/:id (3 tests: 401, 404 IDOR wrong owner, 200 revokes). Added securityEvent.findMany, refreshToken.{findMany,findUnique,update} to Prisma mock. Total server: 676 tests (all green).
- **Server subscription tests created (2026-04-22)** — new `subscription.test.ts` (20th suite): 24 tests covering all 4 endpoints: GET /status (5: 401, free plan, active premium, cancelled still-premium, auto-expiry → DB update), POST /activate (6: 401, 400 missing plan, 400 duration>7, 403 transactionId rejected, 200 trial, 400 P2002 duplicate trial), POST /cancel (4: 401, 400 no active sub, 400 already cancelled, 200 marks cancelled still-premium), POST /webhook (9: 410 revenuecat, 401 wrong secret, 401 no header, 400 missing userId, 404 unknown user, 200 subscription_activated upsert, 200 subscription_cancelled, 200 subscription_expired, 200 stale event skipped). Total server: 700 tests, 20 suites (all green).
- **Client sleepStore expansion (2026-04-22)** — `sleepStore.test.ts` 14→37 tests: added getAverageQuality (4 tests: average over N, 0 with no entries, 0 with no quality set, respects days limit), clearUserData (1 test: empties array), syncFromServer (3 tests: server overwrites + local-only preserved, empty server → no-op, error → no-op), addEntry rollback (1 test: saveSleep failure → entry removed), removeEntry rollback (2 tests: 500 error → re-add, 404 → no rollback). Total client: 566 tests, 29 suites (all green).
- **setInterval .unref() fix (2026-04-28)** — Added `.unref()` to all 9 `setInterval` calls in `server/src/index.ts` (token cleanup 6h, TOTP replay 5m, OTP cleanup 1h, password reset 6h, cache prune 10m, security events trim 24h, retention inner cron 1h, weekly summary 1h, admin digest 1h). Without `.unref()` the Node process stayed alive after all tests completed, causing Jest to hang.
- **retentionService + adminDigestService test suites (2026-04-28)** — Two new test files: `retentionService.test.ts` (33 tests: activation cohort, reactivation 7/14/30d, weekly summary emails with top-exercise calculation, pre-renewal notices, SentAt ordering, banned-user skip, per-user failure isolation, hard caps, runAllRetentionCohorts) and `adminDigestService.test.ts` (33 tests: computeDigestStats Promise.all mock ordering, sendDailyAdminDigest push+email delivery, activation rate calculation, push failure swallowed, email failure reportError, banned users excluded, no admins short-circuits, idempotency by lastAdminDigestSentDate). Total server after suites: 31 suites, 960 tests.
- **OK.ru OAuth removal + HIGH-14 email normalization (2026-04-28)** — Removed Odnoklassniki provider completely: `okId` field dropped from `User` model (schema + auth + user routes + client types/stores/services/screens), `/auth/ok` route deleted (~98 lines), OK.ru tests removed from `auth.social.test.ts` + `user.link.test.ts` + `authStore.social.test.ts` (-66 tests). HIGH-14 fix: email normalization via `.trim().toLowerCase().normalize('NFKC')` applied to Yandex OAuth `default_email` and change-email Zod transform. Also removed `hasOk` from `/auth/check-email` response. Commit `30240a0`. Final counts: server 31 suites/960 tests, client 81 suites/2027 tests.
- **AI medical disclaimer (2026-04-28)** — Added to `SYSTEM_PROMPT` БЕЗОПАСНОСТЬ section: explicit "Все рекомендации носят общеинформационный характер и НЕ являются медицинской консультацией" disclaimer + instruction to append disclaimer on health/injury/symptom questions. Required by Russian law for AI wellness apps.
- **TrainerClient GDPR Cascade fix (2026-04-28)** — `server/prisma/schema.prisma`: `TrainerClient.clientUser onDelete: SetNull` → `onDelete: Cascade`. SetNull left orphaned trainer-client records after user account deletion (152-ФЗ right-to-erasure). Cascade ensures full deletion including TrainerSession records. Requires `prisma db push` on production.
- **HIGH-14 regression tests + ts-jest cache fix (2026-04-28)** — Added 2 HIGH-14 email normalisation regression tests to `server/src/__tests__/auth.social.test.ts`: one for Yandex (`default_email: 'Test@YANDEX.RU'` → `test@yandex.ru` in findUnique + create args), one for Mail.ru (`email: 'User@Mail.RU'` → `user@mail.ru`). Added top-level `import { prisma } from '../db'` (replaces the problematic describe-scope `require` that caused 20 suite failures via stale ts-jest cache). Cleared Jest transform cache (`npx jest --clearCache`). Final counts: server 31 suites/967 tests, client 81 suites/2027 tests. Also: `okId` removed from CLAUDE.md OAuth fields line (was left over from OK.ru removal).
- **Round 2: activation email + admin/me + onboarding telemetry (2026-04-28, commit 7ff1efe7)** — Six improvements landed together:
  (A) `retentionService.processActivationCohort` now sends parallel push+email channels for the 24h-no-firstChat cohort; each channel write-once via independent `activationPushSentAt` / `activationEmailSentAt` flags, internal `*@irongym.internal` stubs filtered. New `sendActivationReminderEmail` in emailService.
  (B) `GET /admin/me` — uncached founder self-status endpoint bundling activation funnel state, push-token count, last AI/workout activity, subscription, active session count. Per-actor (no userId param), real-time vs the 90s-cached `/admin/stats`.
  (C) `POST /user/onboarding/step` — first-touch step telemetry into new `User.onboardingStepLog Json?` and `User.onboardingCompletedAt DateTime?` columns. Idempotent retries don't reshape funnel data. Wired into OnboardingScreen Next button as best-effort.
  (E) AdminDashboard "Твой аккаунт" card surfaces /admin/me with coloured chips for activation/push/subscription/2FA state.
  (F) `/admin/metrics/key` returns onboardingFunnel block (reachedStep0..4 + completed) using JSON `?` operator on onboardingStepLog. AdminMetricsKeyScreen renders as block #6.
  Schema changes pushed via `prisma db push` (no migration files per convention). Tests: +24 retention, +5 admin/me, +8 onboarding/step. Final: server 31 suites/986 tests, client 81 suites/2027 tests. OTA shipped to both `preview` and `production` channels.
- **Round 3: cron health probe (2026-04-28)** — `server/src/utils/cronHealth.ts` provides `trackCron(id, fn)` wrapper that records last-success/last-error timestamps, durations, and counts in-memory. Wrapped 4 existing crons in `index.ts`: `retention` (hourly), `weekly-summary` (Sunday 18:00 UTC), `admin-digest` (daily 06:00 UTC), `keep-warm` (10 min DB ping). New `GET /admin/cron-health` endpoint exposes the ledger for AdminDashboard's "Cron-задачи" card (green/red dot per job + age + counts). Records reset on dyno restart (in-memory by design — Render free-tier restarts every few hours). New `cronHealth.test.ts` (6 tests) + 3 admin endpoint tests. Final: server 32 suites/995 tests.
- **Round 4: p95 latency + onboarding state in /admin/me + test-notification (2026-04-28, commits 808b913, 8faba61, 4925a8b)** — Three observability wins:
  1. `aiMetrics.ts` adds 200-sample rolling window + p50/p95/p99 percentile computation. Cache hits don't pollute the window. AdminDashboard "Ср. задержка" stat now shows p95 with colour-coded thresholds at 2.5s/5s. Falls back to avgLatencyMs on older server builds.
  2. `/admin/me` adds `onboarding: { completed, completedAt, maxStepReached, stepLog }` block derived from User.onboardingStepLog/onboardingCompletedAt. AdminDashboard founder card adds "Онбординг шаг N/5" chip.
  3. New `POST /admin/test-notification` — fires test push and/or email to caller's account, lets founder verify both channels work end-to-end after deploy. Per-actor only, no userId param. AdminDashboard button on founder card calls it and Alert()s the result.
  4. trainer.ts /clients/:id/invite docstring TODO cleared (the 7-day expiry already exists via lazy check at /accept-invite, INVITE_TTL_MS line 234).
  Tests: +4 aiMetrics, +1 admin/me onboarding state, +4 test-notification endpoint. Server is now TODO-free under server/src/. Final: server 33 suites/1004 tests, client 81 suites/2027 tests. OTA shipped to production channel.
- **Rounds 5-9: bug fixes + LRU correctness (2026-04-28, commits ab90086, 1384ceb, 1e7fe12, 36ff848, e89b03a, 7ed895a)** — Six bug fixes:
  - **activityTracker LRU + .unref() (ab90086)**: `lastSeen.set()` on existing key didn't update Map iteration order, so genuinely active users got wrongfully evicted as "oldest" when capacity hit 50k. Fixed with delete-then-set. Also added missing `.unref()` to the prune setInterval.
  - **lastActiveAt for passive readers (1384ceb)**: 7d/14d/30d reactivation cohort gates on `User.lastActiveAt` but only 3 routes (workout-complete, meal-log, AI-chat) refreshed it. Users who opened the app daily to browse but never trained/logged/chatted were getting "we miss you" pushes incorrectly. Added 1h-throttled DB write from auth middleware via new `shouldSyncLastActiveAt(userId)` helper.
  - **News scheduler observability (1e7fe12)**: wrapped news-refresh in `trackCron('news-refresh', ...)` so it shows up in /admin/cron-health. Added `.unref()` to the 6h interval.
  - **NFKC bootstrap (36ff848)**: `ADMIN_BOOTSTRAP_EMAIL` env var got `.trim().toLowerCase()` but missing `.normalize('NFKC')` to match the Zod pipeline applied to user-input emails. Defensive against precomposed-vs-decomposed Unicode mismatches.
  - **AI request timeout 15s→60s (e89b03a + OTA 56ea11a7)**: client-side bug. `aiService.chat`, `analyzeFood`, `analyzeFoodText`, `getWorkoutInsights` used the default 15s axios timeout but Mistral cold-start can take 30-60s. AIChatScreen's stream→chat fallback was timing out and surfacing "проверь подключение" instead of the actual answer.
  - **Cache LRU bugs (7ed895a)**: `routes/ai.ts setCachedResponse` evicted oldest entry unconditionally even when re-caching an existing key. `MemCache.set` had the same Map-iteration-order LRU bug as activityTracker. Both fixed with the same `!has(key)` + delete-then-set pattern. New memCache.test.ts (+11 tests).
- **Rounds 10-11: admin polish (2026-04-28, commits 7d66638, 0744d7b)** — Wording fix (onboarding chip "шаг N/5" → "пройдено N/5") + manual cron trigger. New `POST /admin/cron/run/:id` lets the founder fire retention/weekly-summary/admin-digest immediately without waiting for the scheduled tick (idempotent — *SentAt gates protect from double-send). AdminDashboard cron rows are now tappable with `▶` indicator + confirmation Alert.
- **Rounds 12-18: test coverage backfill (2026-04-28)** — Closed several test gaps for security-critical endpoints:
  - **Round 12 was wrong**: claimed accept-invite "had ZERO tests" but `trainer_invite.test.ts` already covered it. Round 17 (60c0eea) self-corrected by deleting 9 duplicates and keeping the one genuinely-novel test (TOCTOU count=0 race).
  - **Support /messages (944991b)**: +8 tests including the SECURITY assertion that `isStaff` is derived from server-side role lookup (never request body) and IDOR returns 404 not 403 (leakage protection).
  - **Admin force-disable-2fa + force-logout (cfcce5c)**: +8 tests for the two destructive admin ops protected by step-up reauth (HIGH-11).
  - **Google OAuth (f36520f)**: +5 tests covering HIGH-2 (`email_verified=true` gate, blocks Workspace-admin attack), HIGH-14 (email normalisation), and EMAIL_NOT_VERIFIED_LOCAL (refuses auto-link if local account hasn't verified email — prevents pre-registration takeover). Required mocking `google-auth-library` OAuth2Client + setting `GOOGLE_CLIENT_ID_WEB` at file level (route reads it at module load).
  - **VK HIGH-14 (84129ec)**: +1 test for the creation-only normalisation path (VK does no email-based DB lookup per the SECURITY comment, so HIGH-14's job is normalising the email at user creation so future change-email flows find the right row).
  - **DELETE /user/account (46e5c7b)**: +6 tests for the highest-stakes user-initiated op (152-FZ erasure + irreversible cascade). Covers HIGH-7 step-up gate (social-only without 2FA can't delete), password/TOTP gates, and verifies ACCOUNT_DELETED security event lands BEFORE cascade (otherwise FK ref would be gone).
  Final: server 35 suites/1059 tests (+72 from Round 4), client 81 suites/2027 tests.
- **Rounds 19-45: deep test backfill (2026-04-28)** — Continued the test backfill into nearly every untested endpoint in admin.ts + user.ts:
  - User-side: change-password, change-phone, push-token (HIGH-10 takeover), 2FA disable, logout-all, account delete (HIGH-7), onboarding-step idempotency
  - Admin-side: ~25 admin endpoints covered including announcements/active+preview+duplicate, mass-message, subscriptions/broadcast (with cancelled-not-expired branch), users/export + logs/export (CSV-injection guards pinned), digest/preview+readiness+send-now, cron-health + cron/run, moderation/search (filters by role=user + isStaff=false), top-revenue, churn-risk (14d cutoff), subscriptions/forecast (4-week MRR projection bucketing math), subscriptions list (100-cap + expiringSoon window), logs (4-field OR search), staff (SUPPORT-allowed gate), report/daily (date validation), support/:id/assign (assignee-must-be-staff guard), force-verify-email, users/:id/note, users/:id/security-events, users/:id/sessions, analytics/cohorts (8-week window), analytics/segments (auth gate, cache-protected), analytics/subscriptions (days clamp), analytics/export (UTF-8 BOM + column order), metrics/key (cache + windowDays filter)
  - OAuth: Google /auth/google (HIGH-2 + HIGH-14 + EMAIL_NOT_VERIFIED_LOCAL takeover defense), VK HIGH-14 creation-only path
  - Workout routines: DELETE/start/PUT/history with IDOR guards verified to NOT call $transaction or workout.findMany on failed ownership checks (cross-user data-loss prevention)
  - Round 17 (60c0eea) self-corrected round 12's duplicate /accept-invite tests — deleted 9 dupes, kept 1 unique (TOCTOU count=0 race)
  Final: server 35 suites/1222 tests (+163 from round 18 baseline), client 81 suites/2027 tests.

---

## Идеи на будущее

### Средний приоритет

**1. Разбить `server/src/routes/ai.ts`**
Файл ~84k строк, 1783 функции — монолит логики + knowledge. Разнести knowledge-блоки по тематическим файлам в `server/src/knowledge/`, в ai.ts оставить только роутинг, intent/mood, TF-IDF, tool-execution.

**2. Онбординг улучшения**
- Шаг с выбором equipment (штанга, гантели, тренажёры, дома)
- Запрос разрешения на уведомления на последнем шаге

**3. Push-уведомления расширение**
- Еженедельная статистика (воскресенье вечером)
- Напоминание залогировать вес (раз в неделю утром)
- Мотивационное утреннее уведомление в день тренировки

**4. Лидерборд улучшения**
- Фильтр по упражнению
- Фильтр мой зал vs все пользователи
- Личный рейтинг (где я нахожусь)

### Низкий приоритет / идеи на перспективу

**5. Социальные функции** — друзья, сравнение статистики, комментарии к тренировкам

**6. Умный план тренировок** — AI генерирует недельный план, автопериодизация (deload каждые 4 недели), адаптация при пропусках

**7. Видео техники** — ссылки на YouTube в ExerciseDetailScreen или expo-video

**8. Интеграции** — Apple Health / Google Fit, Garmin / Polar, MyFitnessPal

**9. Маркетплейс программ** — пользовательские программы, рейтинг, платные от тренеров

**10. Диаграмма прогресса в виде тела** — 2D/3D фигура с раскраской мышц

**11. Meal prep планировщик** — меню на неделю, список покупок, КБЖУ

**12. Подписка улучшения** — trial 7 дней, годовая со скидкой, реферальная программа

---

## Технический долг

- `ai.ts` — см. пункт 1 выше (главный долг)
- Offline режим — приложение частично падает без сети (есть useConnectionStore, но не везде используется)
- Некоторые OAuth env vars пустые (Google, VK) — если нужна соцсеть-авторизация
- SMS.ru/Twilio ключи не заполнены — сейчас используется только email для OTP

---

## Что НЕ нужно делать

- Не добавлять TypeScript типы туда где их нет (если не просят)
- Не рефакторить код который не трогаем в данный момент
- Не добавлять docstrings и комментарии к существующему коду
- Не менять логику, когда задача только рефакторинг структуры файла
- НЕ запускать `prisma migrate dev/deploy/reset` — проект использует `prisma db push`
