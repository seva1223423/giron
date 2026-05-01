# Дизайн — Direction A (Premium Graphite + Gold)

Источники истины по дизайну приложения.

## Структура

```
docs/design/
├── README.md                   ← вы здесь
└── handoff/                    ← Claude Design handoff bundle (2026-05-01)
    ├── HANDOFF.md              ← инструкция по применению (от дизайн-агента)
    ├── RELEASE.md              ← состав релиз-пакета (canvas + 21 экран)
    └── canvas/                 ← интерактивный дизайн-канвас, 32 артборда
        ├── index.html          ← открыть в браузере: pan/zoom canvas со всеми экранами
        ├── design-canvas.jsx   ← контейнер канваса (артборды, пансвайп, мини-карта)
        ├── ios-frame.jsx       ← iPhone-bezel
        └── src/                ← все экраны, токены, иконки, графики, стикеры
            ├── tokens.js              ← цвета, шрифты, радиусы Direction A
            ├── giron-icons.jsx        ← 12 вариантов иконки приложения
            ├── giron-icons-2.jsx      ← серия 2 (доп. варианты)
            ├── primitives.jsx         ← Phone, Card, Pill, Bar, Stat и т.д.
            ├── upgraded-a*.jsx        ← Главная / Активная / Программа
            ├── variation-a*.jsx       ← варианты экранов
            ├── adaptive-showcase.jsx  ← адаптивность для всех устройств
            ├── responsive-contexts.jsx ← keyboard / type / tablet
            ├── modal-screens.jsx      ← системные модалки + тосты
            ├── stickers.jsx           ← пресс-кит/стикеры
            └── screens/admin/         ← 12 экранов админки
```

## Открыть канвас

```bash
# из корня репо
xdg-open docs/design/handoff/canvas/index.html  # Linux
open docs/design/handoff/canvas/index.html       # macOS
start docs/design/handoff/canvas/index.html      # Windows
```

Никаких зависимостей не нужно — React + Babel грузятся с unpkg, `<script type="text/babel">` компилируется в браузере.

## Иконка приложения

**Канонический вариант: Mono Gold** (1-я в `src/giron-icons.jsx` → `Icon_GMono`).
Тёплое золото на графите: дуга 76% окружности + горизонтальная перекладина = монограмма G, читается как намёк на гриф штанги.

**Палитра:**
- Графит фона: `#0E0E0F`
- Золото (linear gradient): `#F4D69E` → `#D4B07A` (55%) → `#8E6B3E`
- Радиальное свечение: `#D4B07A` @35% alpha → transparent

**Squircle:** iOS app icon radius = 22.37% от размера.

Растровые экспорты живут в `assets/icon.png`, `assets/adaptive-icon.png`,
`assets/splash-icon.png`, `assets/favicon.png` и регенерируются скриптом
[`scripts/generate-app-icon.py`](../../scripts/generate-app-icon.py) — он
рендерит SVG-геометрию из `Icon_GMono` через PIL/NumPy без внешних
инструментов. Запуск: `python scripts/generate-app-icon.py` из корня.

## Когда обновлять канвас

Любые правки направления A — цвета, типографика, добавление/удаление экранов —
вносим **сначала в дизайн-канвас**, потом переносим в `src/`. Это сохраняет
канвас как источник истины и упрощает онбординг новых участников.
