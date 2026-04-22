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
