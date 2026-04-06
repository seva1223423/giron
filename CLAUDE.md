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
- Prisma 6 ORM (PostgreSQL, 22 модели)
- JWT (7d access + 30d refresh) + bcryptjs
- Zod (валидация), Multer (загрузка файлов), CORS
- AI: Mistral API (основной), DeepSeek, Ollama (локальный fallback)

## Архитектура клиента

### Поток: Auth → Onboarding (4 шага) → MainTabs (7 вкладок)

**7 вкладок:** Главная 🏠, Тренировки 💪 (12 экранов), Питание 🍽 (5), Прогресс 📊, ИИ 🤖, Новости 📰, Профиль 👤 (6)

**8 сторов:** auth, workout (самый сложный — PR-детекция, суперсеты, недельный план), nutrition, subscription (лимиты: 10 AI msg/день, 5 сканов), theme, settings, trainer, store/index.ts

**8 компонентов:** Button, Card, Input, FadeIn, AnimatedPressable, ProgressRing, MacroBar, PaywallModal

**7 сервисов:** api.ts (axios + JWT auto-refresh), authService, userService, workoutService, nutritionService, aiService, newsService, notificationService (12 функций уведомлений)

**Данные:** 71 упражнение (data/exercises.ts), 6 программ (data/programs.ts), 20 ачивок (utils/achievements.ts)

## Архитектура сервера

### API маршруты (server/src/routes/)
- `auth.ts` — register, login, refresh
- `user.ts` — profile CRUD, weight log (upsert по дате)
- `workout.ts` — programs CRUD, start/complete workout, history (paginated), leaderboard (top-100 по est1RM), exercises
- `nutrition.ts` — meals CRUD (фильтр по дате)
- `news.ts` — RSS парсинг (4 Google News источника, каждые 6ч), save/unsave, refresh
- `subscription.ts` — status, activate, cancel, webhook
- `ai.ts` — **главный маршрут** (intent classification → mood detection → TF-IDF knowledge selection → 180+ аналитических блоков → AI call → 11 tool-функций)

### AI система (server/src/routes/ai.ts + services/)
- Intent: data_logging, program_creation, workout_modify, technique_question, nutrition_query, analytics_query, greeting, complaint, motivation, general
- 11 tools: create_program, create_workout, log_meal, log_water, delete_meal, update_profile, log_body_weight, modify_workout, set_weekly_plan, update_nutrition_targets
- 25 модулей знаний (server/src/knowledge/, 6547 строк)
- AI Memory (категории: preference, habit, injury, allergy, schedule, personality)
- Кэш: TTL 4ч, max 200

### Ключевые сервисы (server/src/services/)
- `deepseekAI.ts` — OpenAI-compatible клиент (Mistral/DeepSeek), retry, timeout 60s
- `localAI.ts` — Ollama (qwen2.5:14b chat, llama3.2-vision для фото еды)
- `newsRefreshService.ts` — RSS парсер, авто-категоризация

## Структура

```
src/
  screens/       — ai, auth, home, news, nutrition, onboarding, profile, progress, settings, tracker, trainer, workouts
  store/         — 8 Zustand-сторов (все persist через AsyncStorage)
  components/    — 8 переиспользуемых компонентов
  navigation/    — AppNavigator.tsx (трёхступенчатый: Auth/Onboarding/Main)
  services/      — 7 API-сервисов + notifications
  hooks/         — useHaptic.ts
  theme/         — colors (light/dark), typography (16 стилей), spacing, borderRadius
  types/         — index.ts (все типы: User, Exercise, Workout, Program, Meal, NewsArticle, ChatMessage...)
  data/          — exercises.ts (71), programs.ts (6 built-in)
  utils/         — achievements.ts (20 ачивок)

server/
  src/
    routes/      — auth, user, workout, nutrition, news, subscription, ai
    services/    — deepseekAI, localAI, newsRefreshService
    middleware/  — auth.ts (JWT verify)
    knowledge/   — 25 модулей (6547 строк, тренировки/питание/добавки/физиология/психология)
    models/      — (пусто, используется Prisma)
    controllers/ — (пусто, логика в routes)
    utils/       — утилиты
  prisma/
    schema.prisma — 22 модели (User, Program, Workout, Exercise, Meal, ChatMessage, AIMemory, Subscription...)
    seed.ts       — 150+ упражнений, начальные данные
```

## Команды

```bash
# Клиент
npm start              # expo start
npm run android        # expo start --android

# Сервер
cd server
npm run dev            # tsx watch src/index.ts (порт 3001)
npm run prisma:studio  # GUI для БД
npm run prisma:migrate # миграции
npm run prisma:generate # генерация Prisma client
```

## Бренд
- Primary: #FF6B35 (оранжевый)
- Background light: #F8F9FA, dark: #0F0F1A
- Макросы: калории #EF4444, белки #3B82F6, жиры #F59E0B, углеводы #10B981

## Язык
Пользователь общается на русском. Комментарии и коммиты на английском.
