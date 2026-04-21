# Scripts

Утилиты для наполнения библиотеки демо-видео упражнений.

Видео живут в [`assets/exercise-videos/`](../assets/exercise-videos/) и bundled в APK через [`src/data/exerciseVideoAssets.ts`](../src/data/exerciseVideoAssets.ts). Подробности пайплайна — [`docs/MEDIA_HOSTING.md`](../docs/MEDIA_HOSTING.md).

## `fetch-exercise-videos-wikimedia.mjs`

Скачивает видео с Wikimedia Commons — open API, не требует ключей. Лицензии CC-BY / CC-BY-SA / Public Domain.

```bash
node scripts/fetch-exercise-videos-wikimedia.mjs ./exercise-videos-wikimedia
```

Применяет:
- token-overlap scoring между query и title (фильтрует нерелевантные клипы вроде «Asian Jumping Mantis» для `box-jump`)
- OFF_TOPIC blocklist (orbital, space, NSFW, etc.)
- дедупликацию по URL — две разные тренировки никогда не получат один и тот же файл
- прогрессивный `videos-manifest.json` (для обязательной CC-BY атрибуции)

Поисковые запросы для каждого ID настраиваются в [`search-overrides.json`](search-overrides.json).

## `normalize-exercise-videos.mjs`

ffmpeg-пайплайн через бандлированный в `imageio-ffmpeg` бинарь — не требует глобальной установки ffmpeg.

```bash
python -m pip install imageio-ffmpeg   # один раз
node scripts/normalize-exercise-videos.mjs ./exercise-videos-wikimedia ./assets/exercise-videos
```

На каждый исходник — MP4 854×480 H.264 (8 сек, silent AAC, `+faststart`) + JPG-постер с 1-й секунды. Обычно ~300 КБ на видео.

## `process-exercise-videos.sh`

Альтернатива на чистом bash/ffmpeg для случаев когда Node недоступен или нужен другой пресет. Читай заголовок самого скрипта.

## `whitelist-verified.json`

Список 32 exercise ID, чьи видео прошли визуальное QA и лежат в `assets/exercise-videos/`. Держать в синхроне с `EXERCISE_VIDEO_ASSETS` в `src/data/exerciseVideoAssets.ts`. Добавление новой записи: сначала обновить этот файл, потом подтянуть в TS.

## Добавление нового упражнения с видео

1. `node scripts/fetch-exercise-videos-wikimedia.mjs ./tmp` — скачать по search-overrides.
2. Посмотреть файл вручную. Если не подходит — подкорректировать query в `search-overrides.json` и запустить заново, либо подложить свой MP4 с нужным именем.
3. `node scripts/normalize-exercise-videos.mjs ./tmp ./assets/exercise-videos` — привести к 480p H.264 + постер.
4. Добавить запись в `src/data/exerciseVideoAssets.ts` и ID в `scripts/whitelist-verified.json`.
5. Commit + push — клиент автоматически подхватит.
