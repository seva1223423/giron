# Giron — Полный технический разбор проекта

**Дата анализа:** 2026-05-01  
**Версия проекта:** master branch (85a0beb - versionCode sync)  
**Размер кодовой базы:** 437 TS/TSX файлов (клиент) + 94K строк (сервер маршруты) + 6547 строк (AI знания)

---

## I. Архитектура приложения (обзор уровней)

### Уровни приложения
```
1. UI Layer         — 437 компонентов, экранов, хуков (React Native)
2. Navigation       — 3-уровневая иерархия (Auth → Onboarding → MainTabs)
3. State Management — 14+ Zustand-сторов с persistence (AsyncStorage)
4. API Abstraction  — axios-сервис с JWT auto-refresh + интерцепторы
5. Backend         — Express с 11 роутами, Prisma ORM, 38 моделей БД
6. AI System       — 25 knowledge модулей (6547 строк), 33 AI tools
7. Services        — 13 специализированных сервисов (push, email, LLM, etc)
```

---

## II. Клиентская архитектура

### Стек технологий
- **React Native 0.81** + Expo SDK 54 + TypeScript (strict)
- **Navigation:** React Navigation 7 (bottom tabs + native stack)
- **State:** Zustand 5 с async persistence
- **Animations:** React Native Reanimated 4, Gesture Handler
- **HTTP:** axios с кастомными интерцепторами
- **Utils:** date-fns, expo-camera, expo-notifications, react-native-svg, react-native-view-shot

### Навигационная структура (AppNavigator.tsx)

```
App
├─ ErrorBoundary (глобал)
├─ SafeAreaProvider
├─ GestureHandlerRootView
├─ AppNavigator
│  ├─ Auth Stack (Login, Register, ForgotPassword, ResetPassword)
│  ├─ Onboarding (4 шага)
│  └─ Main Tabs (Material Top Tabs, bottom position, swipeable)
│     ├─ HomeTab
│     ├─ WorkoutsTab (WorkoutsStack → 12 экранов)
│     │  ├─ WorkoutsList, ActiveWorkout, ExerciseDetail
│     │  ├─ CustomWorkout, PlateCalculator, ProgramDetail
│     │  ├─ WorkoutHistory, WeeklyPlan, Routines
│     │  ├─ OneRMCalculator, WorkoutCalendar
│     │  ├─ PersonalRecords, Steps, Cardio, AIProgramDetail
│     │  └─ Progress (навигация из Home)
│     ├─ AITab (центральная золотая кнопка)
│     ├─ NutritionTab (NutritionStack → 10 экранов)
│     │  ├─ NutritionMain, FoodScanner, ManualFoodAdd
│     │  ├─ NutritionHistory, MacroCalculator, MealPlan
│     │  ├─ Recipes, RecipeDetail, RecipeForm, AIRecipe
│     │  └─ Recipes AI generation
│     └─ ProfileTab (ProfileStack → 15+ экранов)
│        ├─ ProfileMain, EditProfile, Subscription, ChangePassword
│        ├─ ChangeEmail, ChangePhone, TwoFactor, LinkedAccounts
│        ├─ TrainerDashboard, TrainerClient, Settings, Credits
│        ├─ SessionsScreen (trusted devices), DeleteAccount
│        ├─ SecurityEventsScreen, NewsScreen
│        ├─ Support (SupportScreen, CreateTicket, SupportTicket)
│        └─ Admin (всё обёрнуто в AdminGuard + 10 экранов)
└─ ForceUpdateModal (root overlay для OTA)
```

**Ключевая черта:** Material Top Tabs с `tabBarPosition="bottom"` дают Native pager-view swipe (react-native-pager-view) вместо стандартного bottom-tab navigator.

### 14 Zustand-сторов (все с persist)

| Store | Размер | Назначение | Key fields |
|-------|--------|-----------|-----------|
| useAuthStore | 21KB | Аутентификация, JWT, TOTP | user, token, refreshToken, isOnboarded, justOnboarded |
| useWorkoutStore | 33KB | Программы, тренировки, суперсеты, недельный план | programs, workouts, currentProgram, workoutHistory |
| useNutritionStore | 15KB | Приёмы пищи, КБЖУ, история | meals, dailyMacros, mealHistory |
| useCardioStore | 5KB | Кардиотренировки | cardioSessions, history |
| useMeasurementsStore | 7KB | Объёмы, вес, результаты | measurements, bodyWeights, timeline |
| useSleepStore | 7KB | Сон, отдых | sleepLog, sleepStats, averageHours |
| useRecipesStore | 5KB | Рецепты, избранное | recipes, favorites, history |
| useTrainerStore | 12KB | Тренерские клиенты, сессии | clients, sessions, inviteCode |
| useSubscriptionStore | 9KB | Лимиты (10 AI msg/день, 5 сканов) | isSubscribed, limits, expiry |
| useThemeStore | 2KB | Light/dark, цвета | isDark, colors, typography |
| useSettingsStore | 3KB | Пользовательские настройки | notifications, units, language |
| useSupportStore | 3KB | Тикеты поддержки | tickets, messages |
| useOnboardingTipsStore | <1KB | Советы при onboarding | tips, viewed |
| useConnectionStore | <1KB | Offline status | isOnline |

**Важно:** Все сторы очищаются при logout через `clearStoreUserData()` — защита от утечек данных между аккаунтами.

### Компоненты (15 переиспользуемых)

1. **Button** — primary/secondary/ghost варианты
2. **Input** — с validation, icons
3. **Card** — контейнер с тенью и скругленными углами
4. **FadeIn** — анимация появления (Reanimated)
5. **AnimatedPressable** — scale на нажатие
6. **ProgressRing** — циклический прогресс (макросы, цели)
7. **MacroBar** — калории, белки, жиры, углеводы (цветные)
8. **PaywallModal** — подписка, лимиты
9. **ErrorBoundary** — поймать крахи по скопам (app-root, tab-level)
10. **SkeletonLoader** — плейсхолдеры при загрузке
11. **Tooltip** — подсказки с позиционированием
12. **GoogleAuthButton** — OAuth кнопка (mode: login | link)
13. **ForceUpdateModal** — force-update при новой APK версии
14. **Icon** — единая иконография (SVG-based)
15. **Spinner** — лоадер с анимацией

### Хуки (8 кастомных)

- **useHaptic()** — вибрация (expo-haptics)
- **useSafeTop()**, **useSafeBottom()** — инсеты safe area
- **useAchievementCheck()** — проверка и запуск ачивок (20 видов)
- **usePedometer()** — шаги (expo-sensors)
- **useResponsive()** — адаптивный дизайн (ширина экрана, ориентация)
- **useOrientation()** — portrait/landscape
- **useKeyboard()** — слушать keyboard show/hide
- **useAccessibility()** — screen reader support

### Тема и типография

**Цвета:**
- Primary: #8B5CF6 (violet, gold in dark)
- Background light: #F5F5F7, dark: #0A0A0F
- Макросы: калории #FF3B30, белки #8B5CF6, жиры #FF9F0A, углеводы #34C759

**Типография:** 16 предопределённых стилей для заголовков, тела текста, меток

### OTA Обновления (Expo Updates)

**Модель:** Без пересборки APK (только для JS/TS изменений)

```
Development flow:
1. Коммит + push в master
2. Render автодеплоит сервер
3. Локально: eas update --channel production --message "..."
4. Установленные APK загружают в фоне при следующем запуске
5. На 2-й запуск — новый код активен

Native changes flow:
1. Бамп version в app.json
2. eas build --platform android --profile rustore
3. Старые APK НЕ получат OTA (runtimeVersion.policy: appVersion)
4. Опционально: MIN_CLIENT_VERSION env → 426 force-update response
```

---

## III. Серверная архитектура

### Express Setup (index.ts, 30KB)

**Безопасность:**
- Helmet + strict CSP: `defaultSrc: ['none']`, `frameAncestors: ['none']`
- CORS: Expo Go, localhost, production origins только
- Rate limiters на разные endpoint группы:
  - Admin: 200/15min (была 30, слишком строго)
  - Auth: 20/15min (brute-force protection)
  - AI: 60/min (cost abuse)
- Client version gate: если `MIN_CLIENT_VERSION` set → 426 на старые APK

**Health checks:**
- `/health` — DB ping
- `/health/live` — процесс жив (no DB)
- `/health/ready` — готов к трафику (+ shutdown gate)
- `/health/sentry` — Sentry DSN статус
- `/health/deep` — DB + все LLM провайдеры

**Trust proxy:** Auto-enable на Render/Railway/Heroku по env vars, ручной на локале

### Роуты (11 файлов, 94K строк)

| Файл | Размер | Назначение | Endpoints |
|------|--------|-----------|-----------|
| **ai.ts** | **5.3MB** | **AI чат, intent classification, TF-IDF knowledge, 37 tools** | `POST /ai/chat` (главная) |
| auth.ts | 1.7KB | Register, login, 2FA, OAuth (Google/VK/Yandex/Mail.ru) | 20+ endpoints |
| user.ts | 1.6KB | Профиль, вес, измерения, связанные аккаунты | 25+ endpoints |
| workout.ts | 1.1KB | Программы, тренировки, история, лидерборд | 15+ endpoints |
| nutrition.ts | 164B | Приёмы пищи | 5 endpoints |
| admin.ts | 142KB | Юзеры, баны, метрики, аналитика, объявления | 30+ endpoints |
| trainer.ts | 22KB | Клиенты, invite код, сессии | 10 endpoints |
| subscription.ts | 16KB | Статус, активация, webhook (RevenueCat/YuKassa) | 5 endpoints |
| support.ts | 15KB | Тикеты, сообщения | 8 endpoints |
| recipes.ts | 18KB | CRUD рецепты, AI генерация | 7 endpoints |
| cardio.ts, news.ts | <1KB | Кардио, RSS парсинг | Minimal |

### AI система (ai.ts, 85150 строк)

**Парадигма:**
```
User message
↓
Intent classification (10 intents)
→ data_logging, program_creation, workout_modify, technique_question,
  nutrition_query, analytics_query, greeting, complaint, motivation, general
↓
Mood detection (анализ тона)
↓
TF-IDF knowledge selection (выбрать релевантные блоки из 25 модулей)
↓
Memory context assembly (AIMemory по категориям)
↓
System prompt + knowledge + tools → Mistral/DeepSeek/Ollama
↓
Response parsing + tool calls + validation
↓
Cache set (if cacheable intent)
```

**33 AI Tools:**
- Профиль: `update_user_profile`, `log_body_weight`, `log_body_measurement`
- Тренировки: `create_workout`, `create_program`, `modify_workout`, `delete_program`
  - `set_weekly_plan`, `activate_program`, `adjust_all_weights`, `swap_exercise`, `add_superset`
  - `set_workout_duration_goal`, `set_rest_timer`
- Питание: `log_meal`, `delete_meal`, `modify_meal`, `log_water`, `set_water_target`
  - `update_nutrition_targets`, `find_recipes`, `add_recipe_to_diary`
- Аналитика: `analyze_progress`, `compare_periods`, `get_pr_history`
- Прочее: `log_cardio`, `log_sleep`, `generate_warmup`, `search_exercises`, `explain_exercise`
- Память: `update_memory` (сохранить в AI Memory)

**Cache:** In-memory LRU (макс 200 entries, TTL 4h), для CACHEABLE_INTENTS

**Mood detection:** NLP анализ эмоционального окраса сообщения (простая эвристика)

**Memory (AIMemory модель):**
```
Categories:
- preference (предпочтения в упражнениях)
- habit (привычки, режим дня)
- injury (травмы, ограничения)
- allergy (аллергии, непереносимости)
- schedule (расписание, доступность)
- personality (личностные черты)
- goal (спортивные цели)

TTL: категория может перезаписываться, max 1 запись на категорию на юзера
```

### 25 Knowledge модулей (6547 строк)

**Структура knowledge/index.ts:**
```
trainingPrinciples          — основные принципы (прогрессия, частота, объём)
nutrition                   — макро/микронутриенты, расчёты
exerciseTechnique          — форма, активация, подводные камни
recovery                    — сон, деload, активный отдых
specialPopulations         — женщины, дети, возраст, ограничения
cardioAndConditioning      — HIIT, steady state, интеграция с силой
sportsPhysiology           — VO2max, лактат, МПК
homeAndBodyweight          — тренировки без оборудования
psychologyAndHabits        — мотивация, привычки, консистентность
healthBiomarkers           — холестерин, артериальное давление, анализы
integratedApproach         — комбинирование всех элементов
powerlifting               — специфика приседа, жима, тяги
advancedTechniques         — дроп-сеты, отдых-пауза, волновая периодизация
supplementsDetailed        — протеин, креатин, BCAA, доказательства
womensProgramming          — менструальный цикл, гормоны, упражнения
cuttingBulking             — дефицит, профицит, макросы на фазе
nutritionDatabase          — полная БД продуктов (250+ позиций с КБЖУ)
supplementsEncyclopedia    — 40+ добавок, дозировка, сроки
sportsSpecific             — футбол, баскетбол, теннис, легкая атлетика
combatSports               — бокс, MMA, джиу-джитсу
enduranceSports            — марафон, трейл, триатлон
injuryAndRehab             — восстановление после травм, упражнения
hormonesAndHealth          — тестостерон, кортизол, щитовидка
flexibilityMobility        — растяжка, мобильность, йога
russianSportsSchool        — советская школа (Платонов, Засс, Yessis)
```

**Источники:** Peer-reviewed research (NSCA, ACSM, ISSN), авторы (Schoenfeld, Israetel, McDonald, Helms, Viada, etc.)

### Prisma Schema (38 моделей, 5 enum)

**Основные модели:**

1. **User** — главная модель
   - Auth: email, password, phone, googleId, vkId, yandexId, mailruId
   - Profile: firstName, lastName, dateOfBirth, gender, height, weight
   - Targets: targetCalories, targetProtein, targetFats, targetCarbs, targetWaterMl
   - Security: totpSecret, totpEnabled, totpBackupCodes, isBanned, loginAttempts, lockedUntil
   - Tracking: firstChatAt, lastActiveAt, activationPushSentAt, onboardingStepLog, onboardingCompletedAt
   - Relations: programs, workouts, meals, bodyWeights, chatMessages, subscription, aiMemories, etc.

2. **Auth-related:**
   - RefreshToken (SHA-256 хэшированные)
   - PasswordResetToken
   - TrustedDevice
   - UsedTotpCode
   - OtpCode
   - SecurityEvent
   - PasswordHistory

3. **Workout ecosystem:**
   - Program (user programs)
   - Workout (instances)
   - WorkoutExercise (junction с exercise ID + order)
   - WorkoutSet (sets, reps, weight per exercise)
   - Routine (saved routines)
   - RoutineExercise, RoutineSet
   - Exercise (71 в БД)
   - CardioSession

4. **Nutrition:**
   - Meal
   - MealItem (junction)
   - FoodScanLog (фото еды)
   - Recipe

5. **Progress tracking:**
   - BodyWeight (временной ряд)
   - BodyMeasurement (объёмы)
   - SleepEntry

6. **Social & Support:**
   - TrainerClient (клиенты + история)
   - TrainerSession
   - SupportTicket, SupportMessage
   - ChatMessage (AI chat history)

7. **Monitoring & Admin:**
   - AIMemory (user-scoped)
   - AdminLog
   - Announcement
   - NewsArticle
   - SavedNews
   - PushToken
   - Subscription

**Enums:**
- Gender: MALE, FEMALE
- TrainingGoal: WEIGHT_LOSS, MUSCLE_GAIN, STRENGTH, ENDURANCE, FLEXIBILITY, GENERAL_FITNESS
- FitnessLevel: BEGINNER, INTERMEDIATE, ADVANCED, EXPERT
- UserRole: GUEST, VISITOR, CLIENT, TRAINER, SUPPORT, ADMIN
- RecipeSource: USER, AI, COMMUNITY

### Services (13 файлов)

| Service | Назначение | Key features |
|---------|-----------|--------------|
| deepseekAI.ts | OpenAI-compatible wrapper (Mistral, DeepSeek) | Retry logic, timeout 60s, cost tracking |
| localAI.ts | Ollama fallback (qwen2.5:14b chat, llama3.2-vision) | Локальный, no cost, vision для еды |
| llm/router.ts | Маршрутизация между провайдерами | health check для всех, fallback chain |
| emailService.ts | Nodemailer + Gmail SMTP | Reset password, verification, admin digest |
| smsService.ts | SMS.ru (RU) / Twilio fallback | OTP, notification (deprecated?) |
| pushService.ts | Expo push notifications | Segmentation, template system |
| retentionService.ts | Когортные рассылки | Activation, 7d/14d/30d reactivation (200/tick cap) |
| adminDigestService.ts | Ежедневный дайджест (06:00 UTC) | Пуш + email для ADMIN ролей |
| newsRefreshService.ts | RSS парсинг (4 Google News источника) | Авто-категоризация, каждые 6h |
| aiMemoryService.ts | Wrapper над AIMemory моделью | Category-scoped queries, cleanup |
| errorReporter.ts | Sentry wrapper | Lazy init, PII scrubbing, console fallback |

### Middleware (2 файла)

1. **auth.ts** — JWT verify, ban check, rate-limit guard
2. **clientVersion.ts** — 426 response если APK < MIN_CLIENT_VERSION

### Utilities

- **logger.ts** — простой логгер (console wrapper)
- **errorReporter.ts** — Sentry + console fallback (8KB)
- **activityTracker.ts** — отслеживание активности юзера
- **cronHealth.ts** — in-memory liveness ledger для крон-джобов (сбрасывается на рестарт)
- **memCache.ts** — LRU кэши для админ-статов, новостей, foodVision
- **foodVision.ts** — анализ фото еды (LLM vision, 8KB)
- **inputSanitizer.ts** — очистка от инъекций (HTML, SQL, код)
- **promptInjectionDetector.ts** — детекция попыток изменить system prompt
- **aiMetrics.ts** — сбор метрик по AI интентам, инструментам, ошибкам

---

## IV. Безопасность & Аутентификация

### JWT & Session Management

**Токены:**
- Access token: 60 минут (short-lived, в памяти)
- Refresh token: 30 дней (в SecureStore клиента + хеширован в БД)
- Refresh token хешируется: SHA-256 в БД, оригинал никогда не хранится

**Доверенные устройства:**
- TrustedDevice модель — один раз верифицировать (email/TOTP)
- Дальше автоматический refresh без 2FA для этого девайса

### OAuth & Social Login

| Провайдер | Endpoint | Валидация | Ключ в БД | Env vars |
|-----------|----------|-----------|----------|----------|
| Google | POST /auth/google | google-auth-library verifyIdToken | googleId | GOOGLE_CLIENT_IDS |
| VK ID | POST /auth/vk | api.vk.com/method/users.get | vkId | VK_APP_ID |
| Яндекс | POST /auth/yandex | login.yandex.ru/info | yandexId | YANDEX_CLIENT_ID |
| Mail.ru | POST /auth/mailru | oauth.mail.ru/userinfo | mailruId | MAILRU_CLIENT_ID |

**TOTP gate:** Все провайдеры требуют TOTP перед созданием/привязкой аккаунта (если enabled)

### 2FA (TOTP)

- Генерируется Google Authenticator / Authy-compatible
- Backup codes (10 штук, single-use, хеширован в БД)
- UsedTotpCode таблица — брутфорс на 6-значный код?

### Защита от атак

**Brute-force:**
- loginAttempts счётчик
- lockedUntil timestamp
- Rate limit на auth endpoints (20/15min)

**Injection protection:**
- inputSanitizer.ts (HTML, SQL, код)
- promptInjectionDetector.ts (попытки break system prompt)
- CSP: defaultSrc 'none' в helmet

**CSRF:**
- CORS only allow известные origins
- SameSite cookie по умолчанию (Express)

**Data isolation:**
- Все запросы auth-protected (JWT middleware)
- User ID вытягивается из токена, не от клиента
- clearStoreUserData() при logout

---

## V. Данные & Persistence

### Client-side persistence
- AsyncStorage (React Native) для Zustand stores
- SecureStore для JWT, refresh token (expo-secure-store)
- Device-specific keychain/keystore на платформе

### Server-side persistence
- PostgreSQL на Neon (eu-central-1, Frankfurt)
- Prisma ORM с 38 моделями
- Миграции через `prisma db push` (не migrate!)
- Composite indexes для retention crons

### Кэширование

**Client:**
- Zustand в памяти + AsyncStorage persistence
- useQuery-подобное поведение (manual refetch)

**Server:**
- AI response cache: in-memory LRU (200 entries, TTL 4h)
- Admin stats cache: ~ 5-10 min TTL
- News cache: 6h (RSS parse interval)
- FoodVision cache: 1h (LLM image analysis результаты)

---

## VI. Деплой & Infrastructure

### Development
- Локальный `npm start` (Expo)
- `cd server && npm run dev` (tsx watch)
- Тесты: `npm test` (client + server имеют отдельные jest configs)

### Production
- **Client:** EAS Update + native builds (eas build)
- **Server:** Render (giron-api.onrender.com), auto-deploy on push to master
- **Database:** Neon PostgreSQL
- **LLM:** Mistral API primary, DeepSeek / Ollama fallback
- **Email:** Gmail SMTP
- **SMS:** SMS.ru (RU) / Twilio fallback
- **Push:** Expo Notifications
- **Payments:** RevenueCat (iOS/Android) + YuKassa (RU)

### CI/CD
- GitHub Actions: server-tests.yml (runs Jest tests)
- Render: автодеплой на push в master
- EAS: build & update channels (development, preview, production)

---

## VII. Тестирование

### Клиент (81 jest-suитов, ~2030 тестов)
- Unit tests per screen/component
- Zustand store mocking
- Navigation testing

### Сервер (54 test файла, ~1769 тестов)
- Round 1-18: retentionService, adminDigestService, cronHealth, aiMetrics, memCache
- Round 19-47: backfill existing routes (admin, user, auth.social, workout)
- Round 48-92: добавлены aiMemoryService, recipes, routines, subscription_gating, webhook, validation, leaderboard, llmRouter, promptInjectionDetector, inputSanitizer, contextEngine.memoryBlock, otp, foodVision, errorReporter, trainer_invite, user.link, bugs_regression

**Покрытие:** HIGH-* audit guards pinned для критичных endpoint

---

## VIII. Особенности & Паттерны

### Архитектурные решения

**Почему Material Top Tabs вместо Bottom Tabs?**
- Нужен premium swipe feel (pager-view)
- Bottom-tab-navigator not expose tabBarHideOnKeyboard
- Решение: top-tabs с `tabBarPosition="bottom"` + PremiumTabBar компонент

**Почему Zustand вместо Redux?**
- Меньше boilerplate
- Встроенный persist middleware
- Tree-shakeable (неиспользуемые сторы не включаются)

**Почему Prisma instead SQL?**
- Type-safe queries
- Автоматические миграции через `db push`
- Встроенная relation loading
- Нет N+1 проблем (select fields)

**Почему TF-IDF для knowledge selection?**
- Большой知识 базис (25 модулей, 6547 строк)
- LLM context window constraint
- Выбрать только релевантные блоки для это го intent + user profile

**Почему отдельный AI router (ai.ts 5.3MB)?**
- Сложность: intent → mood → TF-IDF → tools → response parsing
- 85150 строк это SYSTEM PROMPT + knowledge prep + tool docs

### Кодовые конвенции (из CLAUDE.md)

**Язык:**
- Комментарии и коммиты — английский
- UI текст для пользователя — русский
- Нет comment bloat (только WHY, не WHAT)

**Архитектура:**
- No premature abstractions (3+ дублирование OK)
- Trust internal code, validate at boundaries only
- Delete unused code immediately (no half-finished)

**Commit & Push:**
- Вместе (по feedback-память правилам)
- Dual memory (project.md + memory/)
- Knowledge blocks нумерируются (#KB-1, etc)

---

## IX. Известные особенности & TODO

### Особенности
1. **Retention cohorts:** hard cap 200/tick на push-pull per cohort (brute-force scale prevention)
2. **OTA channels:** development, preview, production (eas.json routing)
3. **Onboarding funnel:** Json-field на User для step 0-4 timestamp tracking
4. **Admin digest:** ежедневно в 06:00 UTC (все ADMIN ролей)
5. **News refresh:** каждые 6h (4 Google News источника)

### TODO в коде
- Миграция БД с eu-central (Frankfurt) на Yandex Cloud / VK Cloud (152-ФЗ compliance)
- Android keystore обновление (android-keystore.jks)
- Тесты для некоторых новых вспомогательных модулей

---

## X. Контрольный чек-лист для разработчика

### Перед началом работы
- [ ] `git status` — нет ли незаконченного
- [ ] `npm install` в обоих (root + server/)
- [ ] `.env` файл присутствует (server/.env)
- [ ] `npm run prisma:generate` (client-side, если мёняли schema)

### При добавлении feature
- [ ] Добавить Zustand action если state нужен
- [ ] Написать тесты (Jest)
- [ ] Если API → обновить server/routes и добавить tests
- [ ] Если новый AI tool → добавить в ai.ts, knowledge selection
- [ ] Коммит + push (вместе!)

### При багах
- [ ] Воспроизвести (screenshot, logs)
- [ ] Найти scope (client/server/auth/ai)
- [ ] Написать regression test
- [ ] Фикс + test pass
- [ ] Коммит с reference к issue

---

## XI. Резюме кодовой базы

**Качество кода:** Высокое
- Type-safe (TS strict)
- Well-tested (54 test files, comprehensive coverage)
- Security-conscious (multiple layers)
- Documented (CLAUDE.md, inline comments на критичных местах)

**Масштабируемость:** Подготовлена
- Модульная архитектура
- Кэширование на разных уровнях
- Rate limiting per endpoint type
- LRU cache bounds (200 entries max)

**Специфика для RU:** Полная
- i18n готов (UI на русском)
- OAuth для Russian social networks (VK, Yandex, Mail.ru)
- 152-ФЗ compliance path (миграция на YC/VK Cloud)
- SMS.ru для локальных SMS

---

**Время на понимание:** ~2-3 часа для этого анализа
**Время на изучение codebase:** ~10-15 часов для полного мастерства
**Critical files to understand first:** CLAUDE.md → App.tsx → AppNavigator.tsx → useAuthStore.ts → server/src/routes/ai.ts
