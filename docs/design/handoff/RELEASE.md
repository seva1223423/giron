# Giron — релиз-пакет (всё, что сделано)

Архив содержит три независимых пакета. Каждый можно использовать отдельно.

```
release/
├─ canvas/                  ← HTML design canvas (направление A, 21 экран)
├─ responsive-package/      ← пакет адаптивности для приложения
└─ app-patches/             ← точечные патчи под существующие экраны
```

---

## 1. `canvas/` — HTML design canvas

Полный визуальный макет направления **A — Premium Graphite + Gold**: 21 экран
(онбординг, главная, тренировки, активная, программа, кардио, питание, дневник,
сканер еды, прогресс, ИИ-чат, лента, упражнение, итоги, paywall, профиль,
стикеры, адаптивность × 2).

**Открыть:** двойной клик по `canvas/index.html` (работает в любом современном
браузере без установки).

**Состав:**
- `index.html` — точка входа, монтирует канвас + 21 артборд
- `design-canvas.jsx` — pan/zoom canvas компонент
- `ios-frame.jsx` — iPhone-bezel
- `src/` — исходники экранов, токенов, иконок, графиков, стикеров

Использовалось для согласования направления и итераций по экранам.

---

## 2. `responsive-package/` — пакет адаптивности

Универсальный слой адаптивности под все устройства (iPhone SE → iPad
1024pt → Galaxy Fold). Содержит токены, хуки, обёртки.

**Структура:**
```
responsive-package/
├─ README.md                ← полная документация + миграционная таблица
└─ src/
   ├─ theme/
   │   ├─ responsive.ts          ← брейкпоинты, scale(), bp()
   │   ├─ responsiveStyles.ts    ← createResponsiveStyles()
   │   ├─ spacing.ts             ← spacing × density
   │   └─ index.ts
   ├─ hooks/
   │   ├─ useResponsive.ts       ← bp + dims + scale + safe area
   │   ├─ useOrientation.ts
   │   ├─ useKeyboard.ts
   │   ├─ useAccessibility.ts    ← reduceMotion / boldText / screenReader
   │   └─ useSafeBottom.ts
   ├─ store/
   │   └─ useDensityStore.ts     ← compact / normal / spacious
   ├─ components/
   │   ├─ ScreenContainer.tsx    ← SafeArea + scroll + keyboard
   │   ├─ SafeModal.tsx          ← bottom-sheet с keyboard avoid
   │   ├─ AdaptiveGrid.tsx       ← 1/2/3 колонки по ширине
   │   ├─ FormField.tsx          ← TextInput + label + error
   │   ├─ ResponsiveButton.tsx   ← primary/secondary/ghost/destructive
   │   ├─ IconButton.tsx         ← + IconLabel, badge, a11y
   │   ├─ NavBar.tsx             ← + SectionHeader
   │   ├─ HitTarget.tsx          ← гарантия ≥44pt
   │   ├─ Text.tsx               ← responsive Text
   │   ├─ Skeleton.tsx           ← + SkeletonText
   │   ├─ EmptyState.tsx
   │   └─ Toast.tsx              ← ToastProvider + useToast
   ├─ __tests__/
   │   └─ responsive.test.ts
   └─ index.ts                   ← публичный barrel
```

**Как применить:** скопируйте `responsive-package/src/` поверх своего `src/`
(токены и хуки добавятся, существующие spacing/index расширятся). Подробности
и миграционная таблица — в `responsive-package/README.md`.

---

## 3. `app-patches/` — точечные патчи

Готовые файлы, которые мы правили в существующем приложении giron. Лежат
по своим путям относительно корня проекта.

```
app-patches/
├─ NutritionScreen.tsx                      ← старая копия (не нужна)
├─ QuickMeals.tsx                           ← старая копия (не нужна)
└─ src/
   ├─ components/Icon.tsx                   ← + иконка 'link'
   ├─ navigation/AppNavigator.tsx           ← убран ProgressTab; добавлены
   │                                          Progress в WorkoutsStack и
   │                                          LinkedAccounts в ProfileStack
   ├─ screens/home/HomeScreen.tsx           ← Прогресс в QuickActionsGrid
   └─ screens/profile/
       ├─ ProfileScreen.tsx                 ← блок соцсетей вынесен на
       │                                      отдельный экран; в меню —
       │                                      пункт «Привязанные аккаунты»
       └─ LinkedAccountsScreen.tsx          ← новый экран (VK/Я/G/Mail)
```

**Дополнительно в `app-patches/src/screens/nutrition/`:**
- `NutritionScreen.tsx` — шапка переделана: заголовок + табы в горизонтальном
  ScrollView (больше не уезжают за край)
- `components/QuickMeals.tsx` — карточки пресетов теперь с просмотром /
  редактированием / скрытием (через AsyncStorage оверрайды)

**Как применить:** скопируйте `app-patches/src/` поверх `giron/src/`. Старые
копии `NutritionScreen.tsx` и `QuickMeals.tsx` в корне `app-patches/` оставлены
как бэкап и не нужны для применения.

---

## Краткая хронология

1. Дизайн направления A — 21 экран (canvas)
2. Перенос «Прогресс» из таб-бара в главную
3. Вынос «Привязанные аккаунты» в отдельный экран профиля
4. Починка таб-бара в Питании + редактирование пресетов в QuickMeals
5. Универсальный пакет адаптивности под все устройства
