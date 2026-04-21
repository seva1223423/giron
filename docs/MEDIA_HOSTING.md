# Хостинг видео упражнений

Демо-видео упражнений **bundled в APK** — лежат в `assets/exercise-videos/` и загружаются через `require()` в `src/data/exerciseVideoAssets.ts`. Это один репозиторий, никакого отдельного CDN или медиа-репо.

Плюсы такого подхода:
- Работает полностью офлайн — после установки APK пользователь может открыть любое упражнение без сети
- Нет rate-limit'ов и CDN-затрат
- Нет риска удаления третьей стороной

Минусы:
- +9 МБ к размеру APK (32 видео × ~300 КБ + постеры × 20 КБ)
- Обновление видео требует релиза новой версии

## Добавление новых видео

1. Положите MP4 (854×480, H.264) и JPG-постер в `assets/exercise-videos/` с именами `{exercise-id}.mp4` и `{exercise-id}.jpg`. Список ID — в `src/data/exercises.ts`.
2. Добавьте соответствующую запись в `src/data/exerciseVideoAssets.ts`:
   ```ts
   'new-exercise-id': require('../../assets/exercise-videos/new-exercise-id.mp4'),
   ```
   (и аналогично в `EXERCISE_POSTER_ASSETS`)
3. Добавьте ID в `scripts/whitelist-verified.json`.
4. Всё — клиент автоматически подхватит.

`VERIFIED_INLINE_VIDEO_IDS` в `src/config/store.ts` автоматически вычисляется из ключей `EXERCISE_VIDEO_ASSETS`, так что дублировать список не нужно.

## Подготовка видео

Рекомендуемые параметры:
- **Формат:** MP4, H.264 video + silent AAC (без звука)
- **Разрешение:** 854×480 (480p) — оптимально для мобильного просмотра
- **Длительность:** 8 секунд, loop-friendly
- **Битрейт:** CRF 26 (≈300 КБ на видео)
- **`-movflags +faststart`** — чтобы начиналось воспроизведение без полной загрузки (для bundled видео это менее критично, но всё равно полезно)

### Пакетный конвертер

Если есть исходники в `~/iron-gym-raw/`:

```bash
./scripts/process-exercise-videos.sh ~/iron-gym-raw ./assets/exercise-videos
```

Скрипт использует `ffmpeg` из pip-пакета `imageio-ffmpeg` (не требует глобальной установки ffmpeg). Выдаёт MP4 + JPG для каждого файла.

### Автоматическое скачивание со стока (Wikimedia Commons)

Если не хотите снимать сами — можно скачать клипы с коммерческой лицензией:

```bash
node scripts/fetch-exercise-videos-wikimedia.mjs ./exercise-videos-wikimedia
node scripts/normalize-exercise-videos.mjs ./exercise-videos-wikimedia ./assets/exercise-videos
```

Детали: `scripts/README.md`.

### Альтернатива: Pexels API (если нужно больше выбор)

Получить бесплатный ключ на <https://www.pexels.com/api>, потом:

```bash
export PEXELS_API_KEY="…"
node scripts/fetch-exercise-videos.mjs ./exercise-videos-raw
./scripts/process-exercise-videos.sh ./exercise-videos-raw ./assets/exercise-videos
```

## Лицензии

Все текущие клипы — с Wikimedia Commons под CC-BY или CC-BY-SA. Атрибуция сохраняется в `assets/exercise-videos/ATTRIBUTIONS.md` и `assets/exercise-videos/videos-manifest.json`. По условиям CC-BY/CC-BY-SA эти файлы нужно бандлить с приложением или показывать на отдельном экране "Credits" (планируется в Settings → "Правовая информация").

## Интеграция с ИИ-генерацией видео

Если хотите заменить сток на свои или сгенерированные AI:
- **Runway Gen-3** — $15/мес
- **Pika Labs** — $10/мес
- **Luma Dream Machine** — $29/мес
- **Sora (OpenAI)** — ограниченный доступ
- Локально: **Stable Video Diffusion** (нужен GPU ≥12 ГБ VRAM)

Типичный промпт:
`"top-down view of a person performing {exercise name}, fitness demonstration, neutral grey background, 10 seconds loop, no text, studio lighting"`

После генерации — положите MP4 в `assets/exercise-videos/` и добавьте в `exerciseVideoAssets.ts`.
