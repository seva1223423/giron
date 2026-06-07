# Giron — AI Fitness App

Фитнес-приложение с AI-тренером для российского рынка (RuStore + Google Play + App Store).

> **Для Claude:** главный источник контекста при старте сессии — [`CLAUDE.md`](CLAUDE.md). Этот README — общее описание, может отставать; при конфликте трастуй CLAUDE.md.

---

## Стек

### Клиент (корень проекта)
- **React Native 0.81 + Expo SDK 54 + TypeScript** (strict)
- **Zustand 5** — стейт, 14 сторов, все persist через AsyncStorage
- **React Navigation 7** — bottom tabs + native stack
- **React Native Reanimated 4 + Gesture Handler** — анимации
- **expo-av 16** — инлайн-видео упражнений (bundled в APK)
- **axios** — HTTP с автоматическим JWT refresh
- **expo-camera, expo-image-picker, expo-sharing, expo-secure-store** — медиа и безопасное хранилище токенов

### Сервер (`server/`)
- **Express 4 + TypeScript**
- **Prisma 6** → **PostgreSQL на Neon** (eu-central-1, 34 модели). Миграция на Yandex Managed PostgreSQL запланирована для 152-ФЗ compliance.
- **JWT** — 7d access + 30d refresh + refresh-rotation с reuse-detection
- **Zod** — валидация на всех маршрутах
- **helmet + express-rate-limit** — базовая защита + per-endpoint лимиты
- **Mistral API** (основная AI) → DeepSeek (fallback) → Ollama (локальный fallback, qwen2.5:14b + llama3.2-vision)
- **SMS.ru** (RU) → Twilio (fallback), **Nodemailer + SMTP** для email, **Expo Push** для уведомлений
- Деплой: **Render Frankfurt** (хост `iron-gym-swoe.onrender.com` — он же в `EXPO_PUBLIC_API_URL`), автодеплой при push в master

### Хранилище видео упражнений
- 32 верифицированных MP4 + JPG постера в [`assets/exercise-videos/`](assets/exercise-videos/) — **bundled в APK** (не загружаются извне).
- Источник — Wikimedia Commons под CC-BY / CC-BY-SA. Атрибуции в [`assets/exercise-videos/ATTRIBUTIONS.md`](assets/exercise-videos/ATTRIBUTIONS.md).
- Для упражнений без своего видео клиент показывает fallback на YouTube/Rutube.
- Детали пайплайна и скрипты пополнения — в [`docs/MEDIA_HOSTING.md`](docs/MEDIA_HOSTING.md).

---

## Юрисдикция и мульти-стор

Целевой рынок — **Россия** (RuStore), международные сторы — вторично через тот же код.

- Build-time feature flag `EXPO_PUBLIC_STORE` (`rustore | play | appstore | universal`) переключает видимость провайдеров (Google OAuth, YouTube, платёжные каналы). Реализация — в [`src/config/store.ts`](src/config/store.ts); build-профили в [`eas.json`](eas.json).
- ЮKassa — основной платёжный канал для РФ. RevenueCat удалён (для РФ неработоспособен).
- RF compliance (152-ФЗ): **[`docs/LEGAL_RF_CHECKLIST.md`](docs/LEGAL_RF_CHECKLIST.md)** — пошаговый план легализации (ИП → РКН → миграция БД в РФ → ЮKassa).
- Политика конфиденциальности и Пользовательское соглашение — [`docs/privacy.html`](docs/privacy.html), [`docs/terms.html`](docs/terms.html) под 152-ФЗ + GDPR.

---

## Навигация

Auth Stack → Onboarding (4 шага, возраст ≥14) → MainTabs (7 вкладок)

| Вкладка | Экраны |
|---------|--------|
| Главная | HomeScreen |
| Тренировки | 12 экранов: WorkoutsScreen, CustomWorkoutScreen, ActiveWorkoutScreen, WorkoutSummaryScreen, WorkoutHistoryScreen, WorkoutCalendarScreen, PersonalRecordsScreen, ExerciseDetailScreen, PlateCalculatorScreen, OneRMCalculatorScreen, WeeklyPlanScreen, ProgramDetailScreen, AIProgramDetailScreen |
| Питание | NutritionScreen, ManualFoodAddScreen, FoodScannerScreen, NutritionHistoryScreen, MacroCalculatorScreen |
| Прогресс | ProgressScreen |
| ИИ | AIChatScreen |
| Новости | NewsScreen |
| Профиль | ProfileScreen, EditProfileScreen, SubscriptionScreen, SettingsScreen, TrainerDashboardScreen, TrainerClientScreen, ChangePassword, Sessions, DeleteAccount |

Плюс 11 админ-экранов под `src/screens/admin/` (доступны только роли `ADMIN`).

---

## AI система (`server/src/routes/ai.ts`, ~84k строк)

1. **Intent classification** — 10 классов: data_logging / program_creation / workout_modify / technique_question / nutrition_query / analytics_query / greeting / complaint / motivation / general
2. **Mood detection** из сообщения пользователя
3. **TF-IDF knowledge selection** — топ-5 блоков из 1000+ научных модулей (по training, nutrition, recovery, physiology)
4. **Context building** — профиль, история тренировок, питание, AIMemory
5. **AI call** — Mistral → DeepSeek → Ollama fallback chain
6. **Tool execution** — 11 tools для AI: `create_program`, `create_workout`, `log_meal`, `log_water`, `delete_meal`, `update_profile`, `log_body_weight`, `modify_workout`, `set_weekly_plan`, `update_nutrition_targets`

Кэш ответов: TTL 4 часа, max 200 записей (`server/src/utils/memCache.ts`).

---

## Команды

### Клиент
```bash
npm start              # expo start
npm run android        # expo start --android
npm test               # jest (client unit tests)

# Store-specific builds
eas build --profile rustore --platform android
eas build --profile play    --platform android
eas build --profile appstore --platform ios
```

### Сервер
```bash
cd server
npm run dev            # tsx watch src/index.ts (порт 3001)
npm test               # jest integration tests
npm run prisma:studio  # GUI БД
npm run prisma:generate
npx prisma db push     # применить изменения schema.prisma к БД
# НЕ запускать: prisma migrate dev — проект использует db push
```

### Видео-утилиты
```bash
# Скачать новые клипы с Wikimedia
node scripts/fetch-exercise-videos-wikimedia.mjs ./tmp-raw

# Нормализовать в MP4 854x480 H.264 + JPG постер
node scripts/normalize-exercise-videos.mjs ./tmp-raw ./assets/exercise-videos
# Скопировать в репо, добавить ID в src/data/exerciseVideoAssets.ts
```

---

## Бренд
- Primary: `#8B5CF6` (фиолетовый) / dark mode: `#A78BFA`
- Background: light `#F5F5F7`, dark `#0A0A0F`
- Макросы: калории `#FF3B30`, белки `#8B5CF6`, жиры `#FF9F0A`, углеводы `#34C759`
- Стиль: Apple-style минимализм, единый icon-set, без случайных эмодзи

## Язык
Пользователь общается на русском. Комментарии в коде, commit-сообщения — английский.
