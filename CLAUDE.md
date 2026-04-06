# Iron Gym

Fitness-приложение для тренажёрного зала.

## Стек

### Клиент (корень проекта)
- React Native + Expo SDK 54
- TypeScript
- Zustand (стейт-менеджмент)
- React Navigation (bottom tabs + native stack)
- React Native Reanimated (анимации)
- date-fns, expo-camera, expo-notifications, expo-image-picker

### Сервер (`server/`)
- Express + TypeScript
- Prisma ORM (PostgreSQL)
- JWT-аутентификация (jsonwebtoken + bcryptjs)
- Zod (валидация)
- Multer (загрузка файлов)

## Структура

```
src/
  screens/       — экраны: ai, auth, home, news, nutrition, onboarding,
                   profile, progress, settings, tracker, trainer, workouts
  store/         — Zustand-сторы: auth, nutrition, settings, subscription,
                   theme, trainer, workout
  components/    — переиспользуемые компоненты
  navigation/    — навигация
  services/      — API-сервисы
  hooks/         — кастомные хуки
  theme/         — тема/стили
  types/         — TypeScript типы
  data/          — статические данные
  utils/         — утилиты

server/
  src/
    controllers/ — обработчики запросов
    routes/      — маршруты API
    services/    — бизнес-логика
    middleware/  — JWT auth и др.
    models/      — модели
    knowledge/   — AI база знаний (1500+ блоков)
    utils/       — серверные утилиты
  prisma/        — схема БД и сиды
```

## Команды

```bash
# Клиент
npm start          # expo start
npm run android    # expo start --android

# Сервер
cd server
npm run dev        # tsx watch src/index.ts
npm run prisma:studio  # GUI для БД
npm run prisma:migrate # миграции
```

## Язык
Пользователь общается на русском. Комментарии и коммиты можно на английском.
