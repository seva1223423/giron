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
- **Trainer API** — CRUD клиентов + сессий
- **Autosave endpoint** `POST /workouts/:id/autosave` — каждые 30s
- **Zod валидация** на всех маршрутах
- **AI insights timeout** — AbortController 12s + fallback
- **Forgot/reset password** — полная реализация (email + SMS), rate limited
- **Admin API** — users, subscriptions, logs, security events, support, analytics, announcements
- **Support** — тикеты с сообщениями
- **Cardio** — CRUD кардио-сессий

### Клиент — фичи
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

_Нет активных незаконченных задач._

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
