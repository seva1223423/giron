# Iron Gym — AI Fitness App

> **Для Claude:** Этот README — твой главный источник контекста при старте новой сессии.
> Читай внимательно перед любой работой над проектом.

---

## Стек

### Клиент (корень проекта)
- **React Native 0.81 + Expo SDK 54 + TypeScript** (strict mode)
- **Zustand 5** — стейт-менеджмент, все сторы персистятся через AsyncStorage
- **React Navigation 7** — bottom tabs + native stack
- **React Native Reanimated 4** + Gesture Handler — анимации
- **axios** — HTTP-клиент с автоматическим JWT refresh
- **expo-camera, expo-image-picker, expo-sharing** — медиа
- **react-native-view-shot** — захват экрана для шаринга тренировки
- **react-native-svg** — кастомные графики

### Сервер (`server/`)
- **Express 4 + TypeScript**
- **Prisma 6 ORM** — PostgreSQL, 17 моделей
- **JWT** — access (7d) + refresh (30d) токены
- **Zod** — валидация входящих данных на всех маршрутах
- **Multer** — загрузка файлов
- **Mistral API** — основная AI-модель (через OpenAI-compatible клиент)
- **DeepSeek** — резервная AI-модель
- **Ollama (qwen2.5:14b)** — локальный fallback
- **Ollama (llama3.2-vision)** — распознавание еды по фото

---

## Навигация

```
Auth Stack → Onboarding (4 шага) → MainTabs (7 вкладок)
```

**7 вкладок:**
| Вкладка | Экраны |
|---------|--------|
| Главная 🏠 | HomeScreen |
| Тренировки 💪 | WorkoutsScreen, CustomWorkoutScreen, ActiveWorkoutScreen, WorkoutSummaryScreen, WorkoutHistoryScreen, WorkoutCalendarScreen, PersonalRecordsScreen, ExerciseDetailScreen, PlateCalculatorScreen, OneRMCalculatorScreen, WeeklyPlanScreen, ProgramDetailScreen |
| Питание 🍽 | NutritionScreen, ManualFoodAddScreen, FoodScannerScreen, NutritionHistoryScreen, MacroCalculatorScreen |
| Прогресс 📊 | ProgressScreen |
| ИИ 🤖 | AIChatScreen |
| Новости 📰 | NewsScreen |
| Профиль 👤 | ProfileScreen, EditProfileScreen, SubscriptionScreen, SettingsScreen + TrainerDashboardScreen, TrainerClientScreen |

---

## Структура клиента

```
src/
  screens/
    auth/           LoginScreen, RegisterScreen
    home/           HomeScreen.tsx (232 строки)
      components/   HomeHeader, WorkoutStatusCard, TodayPlanCard, RecommendationCard,
                    StreakWarningCard, LastWorkoutCard, WeeklyStatsCard, MuscleReadinessCard,
                    NutritionCard, WeightCard (modal внутри), AITipCard, DailyQuoteCard, WaterCard
    tracker/        ActiveWorkoutScreen.tsx (234 строки)
      components/   WorkoutHeader, RestTimerOverlay (60-dot circular timer), ExerciseNavBar,
                    SetRow (weight/reps steppers + RPE picker), SetsSection, PRToast
    progress/       ProgressScreen.tsx (105 строк)
      components/   OverviewTab, CalendarTab, AchievementsTab, RecordsTab, WeightTab,
                    PhotosTab, BarChart, LineChart, WeeklyHeatmap
    workouts/       WorkoutSummaryScreen.tsx (908 строк — НЕ рефакторен ещё!)
      summary/      PRCelebration, PRsCard, AchievementsCard, StatsCard, VolumeCard,
                    ComparisonCard, BestSetCard, ExercisesCard, ProgressionCard,
                    AIInsightsCard, WorkoutRatingCard, SessionNoteCard
                    (компоненты созданы но не подключены — рефакторинг прерван)
      + ещё 11 экранов тренировок
    nutrition/      5 экранов
    ai/             AIChatScreen.tsx (631 строка)
    news/           NewsScreen.tsx (496 строк)
    onboarding/     OnboardingScreen.tsx
    profile/        ProfileScreen, EditProfileScreen, SubscriptionScreen
    settings/       SettingsScreen.tsx (558 строк)
    trainer/        TrainerDashboardScreen, TrainerClientScreen (603 строки)
  store/
    useAuthStore.ts         user, token, setUser, login, logout
    useWorkoutStore.ts      ГЛАВНЫЙ СТОР — программы, история, активная тренировка,
                            PR-детекция, суперсеты, недельный план (weekPlan)
    useNutritionStore.ts    дневной лог, цели, вода
    useSubscriptionStore.ts лимиты (10 AI сообщений/день, 5 сканов)
    useThemeStore.ts        colors (light/dark)
    useSettingsStore.ts     restTimerDefault и другие настройки
    useTrainerStore.ts      клиенты тренера — оптимистичные обновления + rollback
    index.ts                re-exports всех сторов
  services/
    api.ts          axios instance, JWT auto-refresh через interceptor
    authService.ts  login, register, refresh
    userService.ts  profile, addWeight
    workoutService.ts getPrograms, startWorkout, completeWorkout, autosaveWorkout,
                      getHistory, getExercises, getLeaderboard
    nutritionService.ts getMeals, addMeal, deleteMeal, updateTargets
    aiService.ts    chat, getWorkoutInsights
    newsService.ts  getNews, saveArticle, unsaveArticle
    notificationService.ts  12 функций: scheduleRestEnd, cancelRestEnd,
                             scheduleStreakRisk, requestPermissions, etc.
    trainerService.ts getClients, addClient, updateClient, deleteClient
    index.ts        re-exports
  components/
    Button, Card, Input, FadeIn, AnimatedPressable,
    ProgressRing, MacroBar, PaywallModal
  navigation/
    AppNavigator.tsx    Auth/Onboarding/Main — трёхступенчатая навигация
  theme/
    colors.ts       light/dark темы — primary: #FF6B35 (оранжевый)
    typography.ts   16 стилей текста (h1-h4, body, caption, number...)
    spacing.ts      xs/sm/md/lg/xl/xxl/xxxl/huge + borderRadius
  types/
    index.ts        User, Exercise, Workout, WorkoutExercise, WorkoutSet,
                    Program, Meal, MealItem, NewsArticle, ChatMessage...
  data/
    exercises.ts    71 встроенное упражнение
    programs.ts     6 встроенных программ
  utils/
    achievements.ts 20 достижений — computeAchievements, getNewlyUnlocked
  hooks/
    useHaptic.ts    light, medium, heavy, success, warning, selection, error
```

---

## Структура сервера

```
server/src/
  index.ts          Express app, маршруты, unhandledRejection/uncaughtException guards
  db.ts             Singleton PrismaClient (export const prisma)
  middleware/
    auth.ts         JWT verify → req.userId
  routes/
    auth.ts         POST /register, /login, /refresh
    user.ts         GET/PATCH /profile, POST /weight (Zod: 20-400 кг)
    workout.ts      GET /programs, POST /programs (Zod), POST /start (Zod),
                    POST /:id/complete, POST /:id/autosave, GET /history, GET /leaderboard,
                    GET /exercises
    nutrition.ts    GET/POST/DELETE /meals (Zod: type enum, items 0-10000)
    news.ts         GET /news, POST /save, DELETE /unsave/:id, POST /refresh
    subscription.ts GET /status, POST /activate, POST /cancel, POST /webhook
    trainer.ts      CRUD /trainer/clients (Zod validation, auth required)
    ai.ts           POST /chat — ГЛАВНЫЙ МАРШРУТ (см. ниже)
  services/
    deepseekAI.ts   OpenAI-compatible client для Mistral/DeepSeek, retry, timeout 60s
    localAI.ts      Ollama client — qwen2.5:14b (chat), llama3.2-vision (food photos)
    newsRefreshService.ts  RSS парсер, 4 Google News источника, авто-обновление каждые 6ч
  knowledge/        25 модулей (~5500 строк суммарно)
    trainingPrinciples, exerciseTechnique, nutrition, supplementsEncyclopedia,
    supplementsDetailed, recovery, sportsPhysiology, psychologyAndHabits,
    cuttingBulking, healthBiomarkers, hormonesAndHealth, flexibilityMobility,
    advancedTechniques, powerlifting, injuryAndRehab, homeAndBodyweight,
    nutritionDatabase, cardioAndConditioning, enduranceSports, russianSportsSchool,
    womensProgramming, specialPopulations, combatSports, sportsSpecific,
    integratedApproach, index.ts
  utils/
    logger.ts       Structured logger: error/warn/info/debug, LOG_LEVEL env var
                    (production дефолт = 'warn')
```

---

## AI Система (server/src/routes/ai.ts) — ВАЖНО

Файл `ai.ts` **очень большой (~78,000 строк)**. Содержит:

### Пайплайн обработки сообщения:
1. **Intent classification** — определение типа запроса:
   `data_logging | program_creation | workout_modify | technique_question | nutrition_query | analytics_query | greeting | complaint | motivation | general`
2. **Mood detection** — анализ эмоционального состояния пользователя
3. **TF-IDF knowledge selection** — автоматический выбор релевантных knowledge-блоков из 1680+ функций
4. **Context building** — сборка контекста: профиль пользователя, история тренировок, питание, AI память
5. **AI call** — Mistral/DeepSeek → Ollama fallback
6. **Tool execution** — 11 инструментов

### 11 Tools (AI может вызвать):
`create_program, create_workout, log_meal, log_water, delete_meal, update_profile, log_body_weight, modify_workout, set_weekly_plan, update_nutrition_targets`

### Knowledge блоки (встроены в ai.ts):
- **1680 функций** встроены напрямую в ai.ts (getBlock0001 … getBlock1680)
- Блоки охватывают: физиологию, биохимию, питание, тренинг, психологию, виды спорта,
  добавки, восстановление, биохакинг, генетику, CrossFit, командные виды спорта, травмы
- TF-IDF алгоритм выбирает топ-5 релевантных блоков для каждого запроса
- **Блоки 1681+ не написаны ещё** — это следующая задача при продолжении knowledge работы

### AI Memory (категории):
`preference | habit | injury | allergy | schedule | personality`

### Cache:
TTL 4 часа, max 200 записей

---

## Prisma Модели (17 штук)

```
User, HealthRestriction, Gym, Exercise, Program, Workout, WorkoutExercise,
WorkoutSet, Meal, MealItem, BodyWeight, ChatMessage, AIMemory, TrainerClient,
NewsArticle, SavedNews, Subscription
```

> **ВАЖНО:** Модель `TrainerClient` добавлена в schema.prisma но `prisma migrate dev`
> **не был запущен** (БД была недоступна). При первом запуске сервера нужно выполнить миграцию.

---

## Ключевые паттерны в коде

### Оптимистичные обновления (useTrainerStore)
```ts
// 1. Обновляем локально сразу
// 2. Отправляем на сервер
// 3. При ошибке — откатываем к предыдущему состоянию (rollback)
```

### Autosave тренировки (ActiveWorkoutScreen)
Каждые 30 секунд сохраняем текущее состояние подходов через `POST /:id/autosave`.
Fire-and-forget (ошибки игнорируются чтобы не мешать тренировке).

### PR детекция (ActiveWorkoutScreen + WorkoutSummaryScreen)
Сравниваем `weight * (1 + reps / 30)` (формула Epley) с историческим лучшим.
При новом рекорде — анимированный тост + конфетти на экране итогов.

### Singleton Prisma
```ts
// server/src/db.ts
export const prisma = new PrismaClient();
// Импортируем отовсюду — не создаём new PrismaClient() в роутах
```

### AbortController timeout
AI insights запрос имеет 12-секундный таймаут с fallback-сообщением.

---

## Состояние рефакторинга экранов

| Экран | До | После | Статус |
|-------|-----|-------|--------|
| ProgressScreen | 1993 строки | 105 строк | ✅ Готово |
| HomeScreen | 970 строк | 232 строки | ✅ Готово |
| ActiveWorkoutScreen | 909 строк | 234 строки | ✅ Готово |
| WorkoutSummaryScreen | 908 строк | 908 строк | ⚠️ Компоненты созданы в `summary/` но НЕ подключены в основном файле — рефакторинг был прерван |
| AIChatScreen | 631 строк | 631 строк | ⏳ Не начат |
| SettingsScreen | 558 строк | 558 строк | ⏳ Не начат |
| WorkoutsScreen | 738 строк | 738 строк | ⏳ Не начат |
| CustomWorkoutScreen | 756 строк | 756 строк | ⏳ Не начат |

---

## Незаконченные задачи (на момент последней сессии)

1. **WorkoutSummaryScreen рефакторинг** — компоненты в `src/screens/workouts/summary/` уже созданы:
   `PRCelebration, PRsCard, AchievementsCard, StatsCard, VolumeCard, ComparisonCard,
   BestSetCard, ExercisesCard, ProgressionCard, AIInsightsCard, WorkoutRatingCard, SessionNoteCard`
   Нужно: дописать `ShareImageCard`, создать `index.ts`, переписать `WorkoutSummaryScreen.tsx` как оркестратор

2. **Knowledge блоки 1681+** — продолжить добавление функций в `server/src/routes/ai.ts`

3. **"Забыли пароль?"** — полная реализация:
   - Модель `PasswordResetToken` в Prisma
   - Email сервис (Nodemailer)
   - Экраны `ForgotPasswordScreen` + `ResetPasswordScreen`

4. **Prisma migrate** для `TrainerClient` модели (нужна запущенная БД)

---

## Команды

```bash
# Клиент
npm start              # expo start
npm run android        # expo start --android

# Сервер
cd server
npm run dev            # tsx watch src/index.ts (порт 3001)
npm run prisma:studio  # GUI для БД
npm run prisma:migrate # prisma migrate dev
npm run prisma:generate # генерация клиента
```

---

## Переменные окружения

```bash
# server/.env
DATABASE_URL="postgresql://user:pass@localhost:5432/iron_gym"
JWT_SECRET="..."
JWT_REFRESH_SECRET="..."
MISTRAL_API_KEY="..."
DEEPSEEK_API_KEY="..."
LOG_LEVEL="warn"  # error | warn | info | debug (дефолт warn в проде)
```

---

## Бренд

- **Primary:** `#FF6B35` (оранжевый)
- **Background light:** `#F8F9FA` / **dark:** `#0F0F1A`
- **Калории:** `#EF4444` / **Белки:** `#3B82F6` / **Жиры:** `#F59E0B` / **Углеводы:** `#10B981`

---

## Важные соглашения

- **Язык:** Пользователь общается на русском. Комментарии в коде и коммиты на английском.
- **После каждого изменения:** `git commit` + `git push` сразу (не накапливать)
- **Коммит формат:** `type(scope): description` — feat, fix, refactor, chore
- **Новые компоненты:** Создавать в `{screen-folder}/components/` рядом с экраном
- **Сторы:** Не создавать `new PrismaClient()` — только импортировать из `../db`
- **Валидация:** Всегда использовать Zod на серверных маршрутах
- **Логирование:** Использовать `logger` из `../utils/logger`, не `console.*`
