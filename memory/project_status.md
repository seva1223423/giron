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
- **Test suite (2026-04)** — 19 server integration suites (410 tests, все 11 маршрутов покрыты), 29 client unit suites (512 tests, все 13 Zustand-сторов покрыты)
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
