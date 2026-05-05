# Behavioral Guidelines (override — applies to all future work)

**Source:** github.com/forrestchang/andrej-karpathy-skills/CLAUDE.md
**Precedence:** these rules override any conflicting instructions later in this file.
**Scope:** future work only — past rounds (R201-R282) stay as committed.
**Tradeoff:** these guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Plain Language

**Объясняй просто, чётко, коротко. Без жаргона.**

Пользователь — solo-основатель, не senior engineer. Каждый ответ должен быть понятен с первого прочтения.

Правила общения:
- Пиши на русском, простыми словами. Технический термин на английском только если нет русского эквивалента.
- Не используй жаргон (smoke test, fanout, idempotent, regression, MR/PR, layer violation) без объяснения в скобках.
- Если факт можно сказать в одной фразе — скажи в одной фразе. Не разворачивай.
- Перед тем как ответить — перечитай свой текст. Если есть слово которое юзер может не знать — переписывай.
- Маркированные списки и таблицы — да. Длинные абзацы — нет.
- Когда задаёшь вопрос — давай конкретные варианты ответа («да/нет», «1/2/3»), не открытое поле.

**Как НЕ надо:**
> «Под §4 success criteria = "новый тест воспроизводит проблему → fix → тест зелёный + старые не сломались". Никакого UI.»

**Как надо:**
> «Я напишу тест который ловит баг. Сначала тест красный. Чиню код — тест становится зелёный. Старые тесты тоже проверяю чтобы ничего не сломалось.»

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes.

**Conflicts with rest of file:**
- Section "Дизайн-агент — ОБЯЗАТЕЛЬНО спавнить" — still applies (UI work needs the design sub-agent), but the design pass must itself follow §3 (surgical, no scope creep).
- Any "audit-driven sweep across N files" pattern from prior rounds — superseded by §2 + §3. Future audits report findings; user picks which to fix; only those get fixed.

---

# Giron

Фитнес-приложение для тренажёрного зала с AI-тренером.

## Стек

### Клиент (корень проекта)
- React Native 0.81 + Expo SDK 54 + TypeScript (strict)
- Zustand 5 (стейт, persist через AsyncStorage)
- React Navigation 7 (bottom tabs + native stack)
- React Native Reanimated 4 (анимации), Gesture Handler
- axios (HTTP), date-fns, expo-camera, expo-notifications, expo-haptics, expo-image-picker, expo-sharing, react-native-svg, react-native-view-shot

### Сервер (`server/`)
- Express 4 + TypeScript
- Prisma 6 ORM (PostgreSQL на Neon eu-central-1, 38 моделей)
- JWT (60m access + 30d refresh, refresh hashed SHA-256) + bcryptjs, helmet, express-rate-limit
- Zod (валидация), Multer (загрузка файлов), CORS
- AI: Mistral API (основной, `mistral-small-latest`), DeepSeek, Ollama (локальный fallback)
- Деплой: Render (`iron-gym-swoe.onrender.com`), автодеплой на push в master

## Архитектура клиента

### Поток: Auth → Onboarding (4 шага) → MainTabs (7 вкладок)

**7 вкладок:** Главная, Тренировки (12 экранов), Питание (5), Прогресс, ИИ, Новости, Профиль (6)

**14 сторов:** auth, workout (самый сложный — PR-детекция, суперсеты, недельный план), nutrition, subscription (лимиты: 10 AI msg/день, 5 сканов), theme, settings, trainer, cardio, connection, measurements, onboardingTips, sleep, support, recipes

**25 компонентов:** Button, Card, Input, FadeIn, AnimatedPressable, ProgressRing, MacroBar, PaywallModal, ErrorBoundary, SkeletonLoader, Tooltip, GoogleAuthButton (mode: `login|link`), ForceUpdateModal, Icon, Spinner, ScreenContainer + ScreenScroll, SafeModal, AdaptiveGrid, HitTarget, ResponsiveText, FormField, Skeleton + SkeletonText, EmptyState, Toast (ToastProvider/useToast), ResponsiveButton, NavBar + SectionHeader, IconButton + IconLabel

**14 сервисов:** api.ts (axios + JWT auto-refresh), admin, ai, auth, cardio, news, notification, nutrition, support, trainer, user, workout, otaUpdater, recipe

**Области экранов (15):** admin, ai, auth, cardio, home, news, nutrition, onboarding, profile, progress, settings, support, tracker, trainer, workouts

**Данные:** 71 упражнение (data/exercises.ts), 6 программ (data/programs.ts), 20 ачивок (utils/achievements.ts)

## Архитектура сервера

### API маршруты (server/src/routes/)
- `auth.ts` — register, login, refresh, 2FA (TOTP), forgot/reset password, sessions, change email/phone
  - Социальный OAuth: `POST /auth/google`, `/auth/vk`, `/auth/yandex`
  - `GET /auth/check-email` — возвращает `{ hasPassword, hasGoogle, hasVk, hasYandex }`
  - Безопасность: SHA-256 хэш refresh-токенов, Google `email_verified` guard, CSRF state в клиенте
- `user.ts` — profile CRUD, weight log, body measurements, sleep, trusted devices, push tokens
  - `POST /user/linked-accounts/:provider` — привязать OAuth (step-up re-auth требует currentPassword/TOTP)
  - `DELETE /user/linked-accounts/:provider` — отвязать OAuth (защита последнего метода входа)
  - provider: `google | vk | yandex`
  - `POST /user/onboarding/step` — first-touch step telemetry (step 0..4) into User.onboardingStepLog Json + onboardingCompletedAt; idempotent re-submissions preserve original timestamp
- `workout.ts` — programs CRUD, start/complete workout, history, leaderboard (top-100 по est1RM), exercises, routines CRUD + progressive overload start
- `nutrition.ts` — meals CRUD (фильтр по дате)
- `news.ts` — RSS парсинг (4 Google News источника, каждые 6ч), save/unsave, refresh
- `subscription.ts` — status, activate, cancel, webhook (RevenueCat/YuKassa/generic)
- `trainer.ts` — клиенты тренера CRUD, invite code flow (generate/accept/expire), TOCTOU-safe `updateMany`
- `cardio.ts`, `support.ts` — кардио, поддержка (тикеты)
- `admin.ts` — пользователи, баны, роли, метрики, аналитика, объявления
  - `GET /admin/me` — uncached founder self-status (activation funnel, onboarding state, push tokens, sub, last AI/workout, sessions)
  - `GET /admin/cron-health` — in-memory liveness ledger for retention/digest/keep-warm crons (resets on dyno restart)
  - `GET /admin/metrics/key` includes `onboardingFunnel` block (per-step drop-off from User.onboardingStepLog)
  - `POST /admin/test-notification` — fires test push and/or email to caller's account; verifies both channels work end-to-end
- `ai.ts` (~84k строк) — **главный маршрут** (intent classification → mood detection → TF-IDF knowledge selection → аналитические блоки → AI call → tool-функции)

### AI система (server/src/routes/ai.ts + services/)
- Intent: data_logging, program_creation, workout_modify, technique_question, nutrition_query, analytics_query, greeting, complaint, motivation, general
- 33 tools: update_user_profile, log_body_weight, create_workout, create_program, update_nutrition_targets, log_water, delete_meal, modify_workout, set_weekly_plan, log_meal, delete_program, adjust_all_weights, log_cardio, modify_meal, log_body_measurement, set_water_target, set_rest_timer, set_notifications, swap_exercise, add_superset, generate_warmup, set_workout_duration_goal, analyze_progress, suggest_next_workout, log_sleep, activate_program, find_recipes, add_recipe_to_diary, search_exercises, explain_exercise, get_pr_history, compare_periods, update_memory
- 25 модулей знаний (server/src/knowledge/, 6547 строк)
- AI Memory (категории: preference, habit, injury, allergy, schedule, personality, goal)
- Кэш: TTL 4ч, max 200

### Middleware (server/src/middleware/)
- `auth.ts` — JWT verify, ban/lock check, rate-limit guard
- `clientVersion.ts` — реджектит запросы от APK ниже `MIN_CLIENT_VERSION` (env), возвращает 426

### Ключевые сервисы (server/src/services/)
- `deepseekAI.ts` — OpenAI-compatible клиент (Mistral/DeepSeek), retry, timeout 60s
- `localAI.ts` — Ollama (qwen2.5:14b chat, llama3.2-vision для фото еды)
- `newsRefreshService.ts` — RSS парсер, авто-категоризация
- `emailService.ts` — Nodemailer + Gmail SMTP (reset password, верификация)
- `smsService.ts` — SMS.ru (RU) / Twilio (fallback)
- `pushService.ts` — Expo push notifications
- `retentionService.ts` — retention push cohorts (activation/7d/14d/30d), weekly summary email; hard cap 200/tick
- `adminDigestService.ts` — ежедневный дайджест метрик для ADMIN пользователей (пуш + email, 06:00 UTC)
- `aiMemoryService.ts` — обёртка над AIMemory model, category-scoped queries
- `errorReporter.ts` — Sentry wrapper (lazy init, PII scrubbing); активируется через SENTRY_DSN (путь: `server/src/utils/`)

### OAuth-провайдеры (Russian social login)

| Провайдер | Endpoint          | Валидация токена                          | Ключ в БД  | Env-переменная              |
|-----------|-------------------|-------------------------------------------|------------|-----------------------------|
| Google    | `POST /auth/google` | google-auth-library `verifyIdToken`      | `googleId` | `GOOGLE_CLIENT_IDS`         |
| VK ID     | `POST /auth/vk`   | `api.vk.com/method/users.get?access_token` | `vkId`     | `VK_APP_ID`                 |
| Яндекс    | `POST /auth/yandex` | `login.yandex.ru/info?format=json`       | `yandexId` | `YANDEX_CLIENT_ID`          |

Все провайдеры проверяют `TOTP gate` перед созданием/привязкой аккаунта.
Клиентские env-переменные (для показа кнопки): `EXPO_PUBLIC_VK_APP_ID`, `EXPO_PUBLIC_YANDEX_CLIENT_ID`.

## Структура

```
src/
  screens/       — admin, ai, auth, cardio, home, news, nutrition, onboarding, profile, progress, settings, support, tracker, trainer, workouts (15 областей)
  store/         — 14 Zustand-сторов (все persist через AsyncStorage)
  components/    — 15 переиспользуемых компонентов + components/app-modal/ (AppModalProvider, ToastHost, installAppAlert)
  navigation/    — AppNavigator.tsx (трёхступенчатый: Auth/Onboarding/Main)
  services/      — 14 API-сервисов
  hooks/         — useHaptic.ts, useSafeTop.ts, useAchievementCheck.ts, usePedometer.ts
  theme/         — colors (light/dark), typography (18 стилей), spacing, borderRadius
  types/         — index.ts (все типы: User, Exercise, Workout, Program, Meal, NewsArticle, ChatMessage...)
  data/          — exercises.ts (71), programs.ts (6 built-in)
  utils/         — achievements.ts (20 ачивок)

server/
  src/
    routes/      — auth, user, workout, nutrition, news, subscription, ai, trainer, cardio, support, admin (11 файлов)
    services/    — deepseekAI, localAI, newsRefreshService
    middleware/  — auth.ts (JWT verify)
    knowledge/   — 25 модулей (6547 строк, тренировки/питание/добавки/физиология/психология)
    models/      — (пусто, используется Prisma)
    controllers/ — (пусто, логика в routes)
    utils/       — утилиты
  prisma/
    schema.prisma — 38 моделей (User, RefreshToken, TrustedDevice, UsedTotpCode, OtpCode, PasswordHistory,
                    PasswordResetToken, SecurityEvent, PushToken, Program, Workout, WorkoutExercise,
                    WorkoutSet, Exercise, HealthRestriction, Gym, CardioSession, SleepEntry,
                    BodyWeight, BodyMeasurement, Meal, MealItem, FoodScanLog, ChatMessage, AIMemory,
                    NewsArticle, SavedNews, Subscription, TrainerClient, TrainerSession,
                    SupportTicket, SupportMessage, AdminLog, Announcement,
                    Routine, RoutineExercise, RoutineSet, Recipe)
    User model OAuth fields: googleId, vkId, yandexId (все @unique, nullable)
    seed.ts       — 150+ упражнений, начальные данные
```

## Команды

```bash
# Клиент
npm start              # expo start
npm run android        # expo start --android
npm test               # jest (client unit tests, 81 суитов, ~2030 тестов)

# Сервер
cd server
npm run dev            # tsx watch src/index.ts (порт 3001)
npm test               # jest (server integration tests, 51 суитов, ~1769 тестов)
                       # Новые суиты добавлены в rounds 2-18 (2026-04-28):
                       # retentionService, adminDigestService, cronHealth,
                       # aiMetrics, memCache, activityTracker
                       # Test backfill rounds 19-47 brought existing suites
                       # (admin, user, auth.social, workout) to ~full
                       # endpoint coverage with HIGH-* audit guards pinned.
                       # Rounds 48-92 added: memoryExtractor, recipes, routines,
                       # subscription_gating, webhook, validation, leaderboard,
                       # llmRouter, promptInjectionDetector, inputSanitizer,
                       # contextEngine.memoryBlock, otp, foodVision, errorReporter,
                       # aiMemoryService, trainer_invite, user.link, bugs_regression
npm run prisma:studio  # GUI для БД
npm run prisma:generate # генерация Prisma client
# НЕ запускать: npm run prisma:migrate (prisma migrate dev) — проект использует `prisma db push`
npx prisma db push     # синхронизация схемы с БД (без migration-файлов)

# OTA обновления (без пересборки APK)
eas update --channel production --message "Описание изменений"
# Для preview-канала (внутренний тестинг):
eas update --channel preview --message "..."
# Только когда ты НЕ менял native-код (ничего из android/, ios/, plugins).
# Если поменялись native-зависимости — нужен новый build (eas build).
```

## OTA-обновления (Expo Updates)

Подключено через `expo-updates` + EAS Update. Channel-маппинг в `eas.json`:
- `development` → канал `development`
- `preview` → канал `preview`
- `rustore`, `play`, `appstore`, `production` → канал `production`

Workflow при изменении JS/TS-кода (без native):
1. Пушишь код в master, Render автодеплоит сервер
2. Локально: `eas update --channel production --message "Что поменялось"`
3. У всех установленных APK обновление загрузится в фоне при следующем запуске
4. На второй запуск — новый код активен

Workflow при изменении native (новые plugins, native-модули):
1. Бамп `version` в `app.json` (например с `1.0.0` на `1.1.0`)
2. `eas build --platform android --profile rustore` — новая APK
3. Старые APK не получат OTA для этой версии (`runtimeVersion.policy: appVersion`),
   останутся на своём билде
4. Опционально: бамп `MIN_CLIENT_VERSION` в Render env, чтобы старые APK получили
   force-update модал и пользователь обновился через магазин

Force-update flow (когда старая версия должна обновиться):
1. В Render env: `MIN_CLIENT_VERSION=1.1.0`
2. Сервер сразу начинает отвечать 426 на запросы от APK 1.0.x
3. `ForceUpdateModal` (root компонент в App.tsx) показывает экран «Обнови приложение»
4. Кнопка «Перезапустить» — пробует OTA из кэша; «Открыть в магазине» — RuStore/App Store
```

## Бренд (Direction A — Premium Graphite + Gold, 2026-04-22)
- Primary (gold): `#D4B07A` (dark) / `#B08A4E` (light)
- Background: `#0E0E0F` (dark, warm graphite) / `#F4F1EA` (light, warm cream)
- Surfaces: `#17171A` (surface/card) → `#1E1E22` (surfaceElevated)
- Text: `#F4F1EA` (warm cream on dark) / `#17171A` (graphite on light)
- Макросы (dark): калории `#E07A6B`, белки `#D4B07A` (= primary), жиры `#E8A36A`, углеводы `#9AC28C`
- Макросы (light): калории `#C76558`, белки `#B08A4E`, жиры `#C9824E`, углеводы `#6FA66A`
- Дизайн: Premium dark с champagne gold акцентом (заменил старый фиолетовый `#8B5CF6` 2026-04-22). 38 SVG-иконок в `Icon` компоненте, без эмодзи, без unicode-глифов.
- Banned legacy palette: `#8B5CF6`, `#A78BFA`, `#7C3AED`, `#6366F1`, `#F59E0B`, `#EF4444`, `#10B981` — нигде в `src/` не должны встречаться (исключение: `src/theme/colors.ts` — источник истины).

## Дизайн-агент — ОБЯЗАТЕЛЬНО спавнить

**Перед любой UI-работой главный агент должен спавнить `design` sub-agent.** Триггеры:
- Изменения в `src/components/**`, `src/screens/**`, `src/theme/**`, `src/hooks/useResponsive.ts`
- Запросы пользователя про внешний вид: «сделай красивее», «не нравится как выглядит», «поправь экран», «темная тема», «иконка», «кнопка», «цвет», «шрифт», «отступ»
- Миграция legacy-экрана на Direction A
- Code review коммитов, затрагивающих UI

Не спавнить для: чисто backend, Prisma, AI tools, серверных маршрутов, type-only изменений без визуального эффекта, test-only изменений (кроме визуальных снапшотов).

Полное определение агента: `.claude/agents/design.md`. Он знает все 38 иконок, 18 стилей типографики, точные hex Direction A, банлист старой палитры, audit-команды grep, паттерны миграции legacy → Direction A.

## Системные модалки и тосты — `src/components/app-modal/`

Все ~270 вызовов `Alert.alert(...)` в коде рендерятся через брендированный `AppModalProvider` (Direction A: графит + золото, hero-иконка из Ionicons, animated scale-in). Подмена работает через `installAppAlert()` в `App.tsx`, которая один раз патчит `RN.Alert.alert` — переписывать существующие `Alert.alert(...)` не нужно.

- `AppModalProvider` — обёртка над приложением, владеет состоянием модалки
- `_AppModalGlobalBridge` — захватывает `show()` в module scope, чтобы `Alert.alert` мог стрелять из любого места (axios interceptors, error reporter)
- `installAppAlert()` — идемпотентная подмена, вызывается один раз на бут (`App.tsx`)
- `ToastHost` + `toast.success(...) / .error / .warn / .info` — top-toast (комплементарно к существующему bottom-`useToast` для блокирующих Alert'ов с экшеном)
- `useAppModal()` — императивный API: `m.show({ kind, title, message, buttons })`

5 видов модалок: `error / success / info / confirm / destructive`. Если `kind` не указан, классифицируется эвристикой `inferKind` по тексту title+message и стилям кнопок. Контракт эвристики залочен тестом `src/__tests__/appModalProvider.test.ts` (пин 18 кейсов).

Дизайн в канвасе: `docs/design/handoff/canvas/index.html` — артборды 22-30 (модалки и тосты).

## Язык
Пользователь общается на русском. Комментарии и коммиты на английском.

## Юрисдикция
Приложение нацелено на российский рынок (планируется RuStore). Легальные требования и чеклист миграции — в [`docs/LEGAL_RF_CHECKLIST.md`](docs/LEGAL_RF_CHECKLIST.md). Ключевые точки:
- Данные пользователей из РФ по 152-ФЗ должны обрабатываться в российской инфраструктуре — сейчас БД на Neon (Frankfurt), планируется миграция на Yandex Cloud / VK Cloud.
- Платёжный канал для РФ — ЮKassa (уже интегрирована в `subscription.ts`). RevenueCat для РФ нерелевантен (Apple/Google платежи из РФ не работают).
- AI-рекомендации НЕ являются медицинскими услугами — всегда держать дисклеймер, избегать диагностики и назначений.
- Политика конфиденциальности ([`docs/privacy.html`](docs/privacy.html)) составлена под 152-ФЗ + GDPR.
