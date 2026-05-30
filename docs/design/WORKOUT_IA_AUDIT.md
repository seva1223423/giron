# Giron — IA-аудит раздела «Тренировки»

**Дата:** 2026-05-23
**Триггер:** «составление программ самому, куда жать чтобы добавлять, поиск тренировок — выглядит сложно, запутанно, неудобно».

---

## TL;DR

В разделе **3 критических бага** и **4 структурных проблемы.** Корень: 19 routes в одном стеке, 5 терминов без объяснения, 2 fundamental UI отсутствуют (создание программы + поиск упражнений).

| # | Проблема | Где | Severity |
|---|---|---|---|
| 1 | **Нет кнопки «Создать программу» вообще** | UserProgramsList, ProgramsTab | 🔴 CRITICAL |
| 2 | **🔍 ищет рутины, не упражнения** | WorkoutsScreen:46 (TODO в коде) | 🔴 CRITICAL |
| 3 | **ExercisesTab компонент существует но не подключён** | ExercisesTab.tsx orphaned | 🔴 CRITICAL |
| 4 | **5 терминов без объяснения** | вся панель | 🟡 HIGH |
| 5 | **Menu и Tab дублируются** (Routines × 2, CustomWorkout × 2) | UtilityMenu + HistoryTab + QuickStartTab | 🟡 HIGH |
| 6 | **19 routes в одном стеке** | AppNavigator | 🟡 HIGH |
| 7 | **Save-as-routine скрыт в ActiveWorkout** | RoutinesListScreen:98 говорит юзеру «иди в ActiveWorkout» | 🟠 MEDIUM |

---

## Текущая структура (как сейчас)

```
┌─────────────────────────────────────────────────────────┐
│ Главная (нижняя вкладка)                                │
│  → ↓ ↓ ↓                                                │
│  WorkoutsScreen                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Header: «Тренировки» 🔍 ⋮                        │  │
│  │         └→ goes to Routines (BUG!)               │  │
│  │                                                  │  │
│  │ HeroStartButton: «Начать тренировку»             │  │
│  │                                                  │  │
│  │ TabBar:                                          │  │
│  │  ┌────────┬─────────┐                            │  │
│  │  │ План   │ История │                            │  │
│  │  └────────┴─────────┘                            │  │
│  │                                                  │  │
│  │ ━━━ tab=План ━━━                                 │  │
│  │ • QuickStartTab:                                 │  │
│  │   - Продолжить (если есть active)                │  │
│  │   - Мои рутины (horizontal scroll)               │  │
│  │   - Мои шаблоны (horizontal scroll)              │  │
│  │   - 12 hardcoded шаблонов (Грудь+Трицепс, и т.д.)│  │
│  │   - Кнопка «Создать свою тренировку»             │  │
│  │ • ProgramsTab:                                   │  │
│  │   - UserProgramsList (только листинг, НЕТ +)     │  │
│  │   - Фильтры (Цель/Уровень)                       │  │
│  │   - 25 встроенных программ                       │  │
│  │                                                  │  │
│  │ ━━━ tab=История ━━━                              │  │
│  │ • 4 карточки:                                    │  │
│  │   - Календарь → WorkoutCalendar                  │  │
│  │   - История → WorkoutHistory                     │  │
│  │   - PR → PersonalRecords                         │  │
│  │   - Рутины → Routines (ДУБЛЬ с ⋮ Menu!)          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ⋮ Menu (UtilityMenu):                                  │
│   1. Кардио       → Cardio                              │
│   2. Шаги         → Steps                               │
│   3. Неделя       → WeeklyPlan                          │
│   4. 1ПМ калькулятор → OneRMCalculator                  │
│   5. Калькулятор блинов → PlateCalculator               │
│   6. Свободная тренировка → CustomWorkout (ДУБЛЬ!)      │
└─────────────────────────────────────────────────────────┘
```

**19 routes стек:**
WorkoutsList, ActiveWorkout, ExerciseDetail, WorkoutSummary, CustomWorkout, PlateCalculator, ProgramDetail, WorkoutHistory, WeeklyPlan, Routines, RoutineDetail, OneRMCalculator, WorkoutCalendar, PersonalRecords, Steps, Cardio, AddCardio, AIProgramDetail, Progress.

---

## Метрики IA (из IA_PRINCIPLES.md)

| Метрика | Норма | Текущее | Статус |
|---|---|---|---|
| **Cognitive density** (clickable per viewport) | ≤5 | 12-15 | ❌ FAIL |
| **Reachability variance** (taps to feature: min/max) | ≤2 | 1 → 4 (Plate calc ⋮ → Calc) | ❌ FAIL |
| **Duplication index** (% features с ≥2 entry points) | ≤10% | 33% (4 из 12 фич дублированы) | ❌ FAIL |
| **Mental model clarity** (типов сущностей юзер видит) | ≤3 | 5 (Программа / Тренировка / Рутина / Шаблон / День программы) | ❌ FAIL |

**4 из 4 метрик провалены.** Это объективно перегружено.

---

## 5 терминов без объяснения

| Слово | Что это в коде | Сохраняется где | Кто создаёт |
|---|---|---|---|
| **Программа** | Prisma `Program` — multi-week план | server DB | built-in (25) или AI или user (но нет UI) |
| **Тренировка** | in-memory `Workout` — одна сессия | client store (`activeWorkout`) | user-started |
| **Рутина** | Prisma `Routine` — saved workout с auto-progression | server DB | user (после ActiveWorkout) |
| **Шаблон** | client-side `savedTemplates` в Zustand | AsyncStorage | user (после CustomWorkout) |
| **День программы** | `Workout` внутри `Program.workouts[]` | server DB | follows Program |

**Mental model на самом деле сводится к 2:**
- **«Что я делаю сейчас»** = Workout (active session)
- **«Что у меня сохранено для следующего раза»** = Routine + Template + Day-of-Program + Preset = ВСЕ ОДНО

Концептуально всё это **«сохранённая тренировка которую можно повторить».** Различия (`auto-progression yes/no`, `server vs client`, `built-in vs user`) — это **технические детали реализации,** не User Mental Model.

---

## 3 критических бага (детально)

### Bug #1 — Нет UI для «Создать свою программу»

**Сценарий:**
> Юзер: «Хочу программу на 4 недели для массы»

**Что он видит:**
- Открывает Тренировки → План → Готовые программы → видит 25 чужих + фильтры
- Ищет «+» в правом верхнем углу — **нет**
- Ищет «Создать программу» где-то — **нет**
- Видит в ⋮ Menu — «Свободная тренировка», но это не программа

**Что есть скрытое:**
- В AI чате можно сказать «создай мне программу» → tool `create_program` → потом видна в `UserProgramsList`

**Но классического UI flow — НЕТ.** Юзер не может построить программу руками без AI.

**Файлы:** `UserProgramsList.tsx:25-99` — только листинг; `ProgramsTab.tsx` — нет CTA на создание; нет route `CreateProgram` в AppNavigator.

---

### Bug #2 — 🔍 ищет рутины, не упражнения

**Код:** `WorkoutsScreen.tsx:45-46`:
```tsx
// TODO: dedicated exercise search screen — currently routes to Routines list as a placeholder browse target.
const handleSearchPress = () => navigation.navigate('Routines');
```

**Сценарий:**
> Юзер: «Как делать жим штанги?»
> Тапает 🔍 → попадает в список «Мои рутины» (пусто если ничего не сохранено)
> Юзер думает «приложение сломано»

**Корень:** Никогда не реализовали ExerciseSearch screen. ExercisesTab.tsx **готовый компонент с поиском + фильтрами + favorites** существует — но **не подключён** к Workouts.

---

### Bug #3 — ExercisesTab.tsx orphaned

**Файл:** `src/screens/workouts/components/ExercisesTab.tsx` (239 строк)
- Полная реализация: search input, 14 muscle filters, 8 equipment filters, favorites через AsyncStorage, тапе на упражнение → ExerciseDetailScreen
- **Не импортируется нигде** кроме `index.ts` экспорта
- Скорее всего legacy — когда-то WorkoutsScreen имел 3 tab (План/История/Упражнения), потом упразднили до 2

**Это значит:** функционал поиска упражнений **готов к работе.** Просто никто не подключил.

---

## 4 структурные проблемы

### #1 — 5 терминов = mental load 5×

См. выше. Если юзеру не объяснили — он либо привыкает (плохой UX) либо уходит.

### #2 — Menu и Tab дублируются

| Фича | Entry point 1 | Entry point 2 | Entry point 3 |
|---|---|---|---|
| Свободная тренировка | QuickStartTab кнопка | ⋮ Menu | — |
| Рутины | QuickStartTab horizontal scroll | History tab card | ⋮ Menu (косвенно) |
| Кардио | ⋮ Menu | — | — |
| Калькулятор 1ПМ | ⋮ Menu | — | — |

Свободная и Рутины дублированы. Это **mental load** — юзер думает «это разное или одно?»

### #3 — 19 routes в одном стеке

WorkoutStack содержит:
- 3 main (Workouts, Active, Summary)
- 6 «management» (Custom, Programs, Routines, History, WeeklyPlan, Calendar)
- 4 utility (PlateCalc, OneRMCalc, Steps, Cardio)
- 2 specialized (PersonalRecords, AddCardio)
- 2 AI (AIProgramDetail, Progress)
- 2 detail (ExerciseDetail, RoutineDetail)

Это **не одна область,** это 4-5 разных областей запиханных в один стек. Юзер не имеет ментальной модели «куда меня ведёт эта кнопка.»

### #4 — Save-as-routine скрыт

`RoutinesListScreen:98-100` буквально говорит юзеру: «Заверши тренировку и нажми "Сохранить как рутину"». Это инструкция в пустом state — потому что **UI кнопки нигде в Workouts tab нет.** Сначала надо начать тренировку, потом завершить, потом увидеть кнопку.

---

## 3 варианта переделки (выбрать какой делать)

---

### 🟢 **Вариант A — Хирургические фиксы (2-3 часа)**

Только bugfixes без архитектурных перестроек. Минимальный риск.

**Что делаю:**
1. ✅ Bug #2: 🔍 → подключить **существующий ExercisesTab** как route `ExerciseLibrary`
2. ✅ Bug #3: ExercisesTab orphaned → wire to AppNavigator
3. ✅ Bug #1: Добавить кнопку «Создать программу» в `ProgramsTab` (выше списка) → ведёт на **новый минимальный экран** `CreateProgramScreen` который собирает программу из существующих CustomWorkout-сессий
4. ✅ Bug #5: Убрать дубль «Рутины» из History tab (оставить в ⋮)
5. ✅ Bug #5: Убрать дубль «Свободная тренировка» из ⋮ menu (оставить в QuickStartTab)

**Что НЕ делаю:**
- Не унифицирую Routine + Template (data model migration)
- Не переименовываю термины
- Не реорганизую tab structure
- Не пишу tooltip объяснений

**Результат:** все 3 critical bugs закрыты. 2 дубля убраны. Структура та же.

---

### 🟡 **Вариант B — Структурная переделка (5-7 часов)**

Перестройка панели с сохранением data model.

**Что делаю (всё что в A) ПЛЮС:**
1. ✅ Заменить tab bar (План/История) на 3 tabs: **«Начать» / «Программы» / «Библиотека»**
   - Начать: Hero CTA + Continue + Last workouts (history mini-feed)
   - Программы: User programs + Built-in (с фильтрами)
   - Библиотека: ExercisesTab content (поиск упражнений)
2. ✅ Унифицировать **UI термин** «Рутина» и «Шаблон» → один лейбл **«Шаблон»** в UI (data models остаются)
3. ✅ Добавить explainer tooltips на первый запуск («Что такое шаблон?», «Что такое программа?»)
4. ✅ Убрать «История» tab в верхний uplevel (ProfileScreen → История или сделать tab на bottom nav)
5. ✅ Reorganize ⋮ menu в 2 группы: «Инструменты» (3 calc-а) и «Логирование» (Кардио, Шаги, План недели)
6. ✅ Новый экран `CreateProgramScreen` с drag-and-drop builder для assembly из existing templates

**Что НЕ делаю:**
- Не меняю Prisma schema (Routine + Program остаются)
- Не удаляю legacy routes (depreciation gradually)

**Результат:** ~50% reduction in cognitive load. Понятная структура. Все entry points в одном месте.

---

### 🔴 **Вариант C — Полная переделка с data model (10-14 часов)**

Унификация концептов на уровне БД + UI.

**Что делаю (всё что в B) ПЛЮС:**
1. ✅ Объединить `Routine` + client `Template` + hardcoded `Preset` → одна сущность **«Шаблон»** в Prisma:
   - Drop `Routine` Prisma model
   - Create unified `Template` model: `{ id, userId, name, exercises[], source: 'user'|'preset'|'ai', hasProgression: boolean }`
   - Migrate 12 hardcoded presets → DB seeds
   - Migrate client-side savedTemplates → server
2. ✅ Программа = список Templates с расписанием:
   - `Program.workouts` → `Program.templateIds[]` + scheduling metadata
   - Day-of-program = Template reference (не отдельная сущность)
3. ✅ Single creation flow:
   - «Создать шаблон» — CustomWorkout → save → Template
   - «Создать программу» — выбрать N Templates → распределить по дням/неделям → save → Program
4. ✅ Single UI mental model: только 2 термина «Шаблон» и «Программа» (на UI)
5. ✅ Server migration via `prisma db push` (юзер single-user, OK)
6. ✅ Client cleanup: убрать `useWorkoutStore.savedTemplates` (всё на server)

**Что НЕ делаю:**
- AI tool `create_program` остаётся (создаёт server Program)
- ActiveWorkout flow не меняется

**Результат:**
- Mental model = 2 концепта (было 5)
- Cognitive density сокращается до ≤5
- Все 3 bug + 4 структурные проблемы исправлены
- Backwards compat: для sevka (single-user) безопасно через `prisma db push`. Для production юзеров — нужна data migration script

---

## Рекомендация

Если ты хочешь **«сделать чтобы за неделю было пользуемо»** — выбирай **B**.

Если **«сделать правильно один раз»** — **C**, но потратишь рабочий день.

Если **«срочно ничего серьёзного»** — **A**, 2 часа.

---

## Вопросы перед началом

Перед тем как браться — нужны 2 решения:

1. **Какой вариант?** A / B / C
2. **CreateProgramScreen — visual builder или wizard?**
   - Builder: drag-drop списка дней с возможностью добавлять упражнения inline
   - Wizard: 4 шага (название → дни недели → длительность → дни и упражнения)
   - Wizard проще, Builder премиальнее
