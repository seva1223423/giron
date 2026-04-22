# Iron Gym

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
- Prisma 6 ORM (PostgreSQL на Neon eu-central-1, 37 моделей)
- JWT (7d access + 30d refresh) + bcryptjs, helmet, express-rate-limit
- Zod (валидация), Multer (загрузка файлов), CORS
- AI: Mistral API (основной, `mistral-small-latest`), DeepSeek, Ollama (локальный fallback)
- Деплой: Render (`iron-gym-swoe.onrender.com`), автодеплой на push в master

## Архитектура клиента

### Поток: Auth → Onboarding (4 шага) → MainTabs (7 вкладок)

**7 вкладок:** Главная, Тренировки (12 экранов), Питание (5), Прогресс, ИИ, Новости, Профиль (6)

**13 сторов:** auth, workout (самый сложный — PR-детекция, суперсеты, недельный план), nutrition, subscription (лимиты: 10 AI msg/день, 5 сканов), theme, settings, trainer, cardio, connection, measurements, onboardingTips, sleep, support

**11 компонентов:** Button, Card, Input, FadeIn, AnimatedPressable, ProgressRing, MacroBar, PaywallModal, ErrorBoundary, SkeletonLoader, Tooltip

**12 сервисов:** api.ts (axios + JWT auto-refresh), admin, ai, auth, cardio, news, notification, nutrition, support, trainer, user, workout

**Области экранов (15):** admin, ai, auth, cardio, home, news, nutrition, onboarding, profile, progress, settings, support, tracker, trainer, workouts

**Данные:** 71 упражнение (data/exercises.ts), 6 программ (data/programs.ts), 20 ачивок (utils/achievements.ts)

## Архитектура сервера

### API маршруты (server/src/routes/)
- `auth.ts` (1475 строк) — register, login, refresh, 2FA (TOTP), forgot/reset password, sessions, change email/phone
- `user.ts` (1267 строк) — profile CRUD, weight log, body measurements, sleep, trusted devices, push tokens
- `workout.ts` (1067 строк) — programs CRUD, start/complete workout, history, leaderboard (top-100 по est1RM), exercises, routines CRUD + progressive overload start
- `nutrition.ts` — meals CRUD (фильтр по дате)
- `news.ts` — RSS парсинг (4 Google News источника, каждые 6ч), save/unsave, refresh
- `subscription.ts` — status, activate, cancel, webhook (RevenueCat/YuKassa/generic)
- `trainer.ts` — клиенты тренера CRUD
- `cardio.ts`, `support.ts`, `admin.ts` — кардио, поддержка (тикеты), админка
- `ai.ts` (~84k строк) — **главный маршрут** (intent classification → mood detection → TF-IDF knowledge selection → аналитические блоки → AI call → tool-функции)

### AI система (server/src/routes/ai.ts + services/)
- Intent: data_logging, program_creation, workout_modify, technique_question, nutrition_query, analytics_query, greeting, complaint, motivation, general
- 26 tools: update_user_profile, log_body_weight, create_workout, create_program, update_nutrition_targets, log_water, delete_meal, modify_workout, set_weekly_plan, log_meal, delete_program, adjust_all_weights, log_cardio, modify_meal, log_body_measurement, set_water_target, set_rest_timer, set_notifications, swap_exercise, add_superset, generate_warmup, set_workout_duration_goal, analyze_progress, suggest_next_workout, log_sleep, activate_program
- 25 модулей знаний (server/src/knowledge/, 6547 строк)
- AI Memory (категории: preference, habit, injury, allergy, schedule, personality)
- Кэш: TTL 4ч, max 200

### Ключевые сервисы (server/src/services/)
- `deepseekAI.ts` — OpenAI-compatible клиент (Mistral/DeepSeek), retry, timeout 60s
- `localAI.ts` — Ollama (qwen2.5:14b chat, llama3.2-vision для фото еды)
- `newsRefreshService.ts` — RSS парсер, авто-категоризация
- `emailService.ts` — Nodemailer + Gmail SMTP (reset password, верификация)
- `smsService.ts` — SMS.ru (RU) / Twilio (fallback)
- `pushService.ts` — Expo push notifications

## Структура

```
src/
  screens/       — admin, ai, auth, cardio, home, news, nutrition, onboarding, profile, progress, settings, support, tracker, trainer, workouts (15 областей)
  store/         — 13 Zustand-сторов (все persist через AsyncStorage)
  components/    — 11 переиспользуемых компонентов
  navigation/    — AppNavigator.tsx (трёхступенчатый: Auth/Onboarding/Main)
  services/      — 12 API-сервисов
  hooks/         — useHaptic.ts, useSafeTop.ts, useAchievementCheck.ts, usePedometer.ts
  theme/         — colors (light/dark), typography (16 стилей), spacing, borderRadius
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
    schema.prisma — 37 моделей (User, RefreshToken, TrustedDevice, UsedTotpCode, OtpCode, PasswordHistory,
                    PasswordResetToken, SecurityEvent, PushToken, Program, Workout, WorkoutExercise,
                    WorkoutSet, Exercise, HealthRestriction, Gym, CardioSession, SleepEntry,
                    BodyWeight, BodyMeasurement, Meal, MealItem, FoodScanLog, ChatMessage, AIMemory,
                    NewsArticle, SavedNews, Subscription, TrainerClient, TrainerSession,
                    SupportTicket, SupportMessage, AdminLog, Announcement,
                    Routine, RoutineExercise, RoutineSet)
    seed.ts       — 150+ упражнений, начальные данные
```

## Команды

```bash
# Клиент
npm start              # expo start
npm run android        # expo start --android
npm test               # jest (client unit tests, 29 суитов, ~555 тестов)

# Сервер
cd server
npm run dev            # tsx watch src/index.ts (порт 3001)
npm test               # jest (server integration tests, 19 суитов, ~554 тестов)
npm run prisma:studio  # GUI для БД
npm run prisma:generate # генерация Prisma client
# НЕ запускать: npm run prisma:migrate (prisma migrate dev) — проект использует `prisma db push`
npx prisma db push     # синхронизация схемы с БД (без migration-файлов)
```

## Бренд
- Primary: #8B5CF6 (фиолетовый) / dark mode: #A78BFA
- Background light: #F5F5F7, dark: #0A0A0F
- Макросы: калории #FF3B30, белки #8B5CF6, жиры #FF9F0A, углеводы #34C759
- Дизайн: Apple-style минимализм, единый стиль иконок, без случайных эмодзи

## Язык
Пользователь общается на русском. Комментарии и коммиты на английском.

## Юрисдикция
Приложение нацелено на российский рынок (планируется RuStore). Легальные требования и чеклист миграции — в [`docs/LEGAL_RF_CHECKLIST.md`](docs/LEGAL_RF_CHECKLIST.md). Ключевые точки:
- Данные пользователей из РФ по 152-ФЗ должны обрабатываться в российской инфраструктуре — сейчас БД на Neon (Frankfurt), планируется миграция на Yandex Cloud / VK Cloud.
- Платёжный канал для РФ — ЮKassa (уже интегрирована в `subscription.ts`). RevenueCat для РФ нерелевантен (Apple/Google платежи из РФ не работают).
- AI-рекомендации НЕ являются медицинскими услугами — всегда держать дисклеймер, избегать диагностики и назначений.
- Политика конфиденциальности ([`docs/privacy.html`](docs/privacy.html)) составлена под 152-ФЗ + GDPR.
