---
name: Project Status & All Ideas
description: Полный статус проекта, все идеи и задачи обсуждённые за всё время работы
type: project
---

## Что уже сделано (хронологически)

### Инфраструктура
- `CLAUDE.md` — контекстный файл проекта, автозагружается Claude Code
- Memory система в `~/.claude/projects/.../memory/` + дублирование в репозитории
- `README.md` — подробный briefing для будущих сессий Claude
- Singleton PrismaClient в `server/src/db.ts` — исправлена утечка 8 инстансов
- Structured logger `server/src/utils/logger.ts` — LOG_LEVEL env var, production дефолт 'warn'
- 62 `console.*` → `logger.*` по всему серверу
- `unhandledRejection` + `uncaughtException` guards в `server/src/index.ts`

### Сервер — новые фичи
- **Trainer API** (`server/src/routes/trainer.ts`) — полный CRUD клиентов тренера, Zod валидация
- **Модель TrainerClient** добавлена в `schema.prisma` (migrate dev ещё не запущен — нужна БД)
- **Autosave endpoint** `POST /workouts/:id/autosave` — сохранение подходов на лету
- **Zod валидация** на всех маршрутах: nutrition.ts, user.ts (вес 20-400кг), workout.ts
- **AI insights timeout** — AbortController 12 секунд + fallback-сообщение

### Клиент — новые фичи
- **useTrainerStore** — оптимистичные обновления + rollback при ошибке сервера
- **trainerService.ts** — API сервис для тренера
- **Autosave тренировки** — useEffect в ActiveWorkoutScreen, каждые 30 секунд
- **"Забыли пароль?"** — заглушка Alert.alert (полная реализация не сделана)

### AI Knowledge Base (server/src/routes/ai.ts)
Добавлены блоки знаний 1591–1680 (90 функций за сессию):
- 1591-1610: базовые блоки
- 1611-1620: общие принципы
- 1621-1640: генетика + CrossFit
- 1641-1660: питание + биохакинг
- 1661-1680: профилактика травм + командные виды спорта

### Рефакторинг экранов
| Экран | Было | Стало | Компоненты |
|-------|------|-------|------------|
| ProgressScreen | 1993 строки | 105 строк | OverviewTab, CalendarTab, AchievementsTab, RecordsTab, WeightTab, PhotosTab, BarChart, LineChart, WeeklyHeatmap |
| HomeScreen | 970 строк | 232 строки | HomeHeader, WorkoutStatusCard, TodayPlanCard, RecommendationCard, StreakWarningCard, LastWorkoutCard, WeeklyStatsCard, MuscleReadinessCard, NutritionCard, WeightCard, AITipCard, DailyQuoteCard, WaterCard |
| ActiveWorkoutScreen | 909 строк | 234 строки | WorkoutHeader, RestTimerOverlay, ExerciseNavBar, SetRow, SetsSection, PRToast |
| WorkoutSummaryScreen | 908 строк | ~130 строк | PRCelebration, PRsCard, AchievementsCard, StatsCard, VolumeCard, ComparisonCard, BestSetCard, ExercisesCard, ProgressionCard, AIInsightsCard, WorkoutRatingCard, SessionNoteCard, ShareImageCard |

---

## В процессе (незаконченное)

_Нет активных незаконченных задач._

---

## Все идеи и планы на будущее

### Высокий приоритет

**1. "Забыли пароль?" — полная реализация**
- Модель `PasswordResetToken` в Prisma: `userId, token (hashed), expiresAt, usedAt`
- Endpoint `POST /auth/forgot-password` — генерация токена, отправка email
- Endpoint `POST /auth/reset-password` — проверка токена, смена пароля
- Email сервис: Nodemailer + SMTP (или SendGrid API)
- Экран `ForgotPasswordScreen` — ввод email
- Экран `ResetPasswordScreen` — ввод нового пароля по deep link
- Deep link схема: `irongym://reset-password?token=...`

**2. Knowledge blocks 1681+**
Продолжить заполнение базы знаний AI. Последний блок: 1680.
Темы для следующих блоков (предложения):
- Периодизация тренировок (линейная, волновая, блоковая)
- Диетология — рефиды, диетные паузы
- Ментальное здоровье и спорт
- Сон и его влияние на восстановление
- Дыхательные техники (Вим Хоф, box breathing)
- Возрастные особенности (40+, 50+)
- Подготовка к соревнованиям (пауэрлифтинг, бодибилдинг)
- Вегетарианское/веганское питание для спортсменов
- Фармакология спорта (образовательно)
- Холодовая терапия и контрастный душ

**3. Prisma migrate для TrainerClient**
Запустить `cd server && npm run prisma:migrate` при доступной PostgreSQL.
TrainerClient уже в schema — только миграция нужна.

### Средний приоритет

**4. Рефакторинг оставшихся больших экранов**
По убыванию размера:
- `WorkoutsScreen.tsx` (738 строк) — список программ + начало тренировки
- `CustomWorkoutScreen.tsx` (756 строк) — конструктор тренировки
- `AIChatScreen.tsx` (631 строка) — чат с AI
- `SettingsScreen.tsx` (558 строк) — настройки
- `TrainerClientScreen.tsx` (603 строки) — карточка клиента тренера
- `NutritionScreen.tsx` (627 строк) — трекер питания

**5. Онбординг улучшения**
- Сейчас 4 шага: имя, цель, уровень, программа
- Идея: добавить шаг с выбором equipment (штанга, гантели, тренажёры, дома)
- Идея: запрос разрешения на уведомления на последнем шаге

**6. Push-уведомления расширение**
- Сейчас: напоминание об отдыхе, риск серии
- Идея: еженедельная статистика (воскресенье вечером)
- Идея: напоминание залогировать вес (раз в неделю утром)
- Идея: мотивационное утреннее уведомление в день тренировки

**7. Лидерборд улучшения**
- Сейчас: топ-100 по estimated 1RM, все упражнения вместе
- Идея: фильтр по упражнению
- Идея: фильтр мой зал vs все пользователи
- Идея: личный рейтинг (где я нахожусь)

### Низкий приоритет / идеи на перспективу

**8. Социальные функции**
- Добавление в друзья
- Сравнение статистики с другом
- Комментарии к тренировкам

**9. Умный план тренировок**
- AI генерирует недельный план на основе цели, уровня, доступного времени
- Автоматическая периодизация (деload неделя каждые 4 недели)
- Адаптация плана если пропустил тренировку

**10. Видео техники упражнений**
- Ссылки на YouTube видео в ExerciseDetailScreen
- Или встроенное видео через expo-video

**11. Интеграции**
- Apple Health / Google Fit — синхронизация шагов, ЧСС
- Garmin / Polar — импорт данных с умных часов
- MyFitnessPal — импорт питания

**12. Маркетплейс программ**
- Пользователи могут публиковать свои программы
- Рейтинг и отзывы
- Платные программы от тренеров (монетизация)

**13. Диаграмма прогресса в виде тела**
- 3D или 2D фигура с раскраской мышц по степени тренированности/усталости
- Интерактивная — нажал на мышцу → видишь историю

**14. Meal prep планировщик**
- Составление меню на неделю
- Список покупок
- Расчёт КБЖУ на неделю

**15. Подписка — улучшения**
- Сейчас: free/pro/trainer/club
- Идея: trial period 7 дней для Pro
- Идея: годовая подписка со скидкой
- Идея: реферальная программа

---

## Технический долг

- `ai.ts` — 78,000+ строк, единственный файл. Нужно разбить knowledge блоки по тематическим файлам (аналог `server/src/knowledge/`), а в ai.ts оставить только логику роутинга
- WorkoutSummaryScreen рефакторинг (см. выше)
- Тесты — их нет совсем. Минимум: unit тесты для achievements.ts и сервисов
- Error boundaries в React Native компонентах
- Offline режим — сейчас приложение падает без сети
- Rate limiting на API endpoints (сейчас нет кроме AI limits)

---

## Что НЕ нужно делать

- Не добавлять TypeScript типы туда где их нет (если не просят)
- Не рефакторить код который не трогаем в данный момент
- Не добавлять docstrings и комментарии к существующему коду
- Не менять логику, когда задача только рефакторинг структуры файла
