# Хостинг видео упражнений

Полный контроль над демонстрационными видео упражнений — через собственную инфраструктуру в РФ. Одинаково работает в RuStore, Google Play и App Store.

## Архитектура

```
Клиент (expo-video)
      │
      ▼
CDN (опционально: Yandex Cloud CDN)
      │
      ▼
Yandex Object Storage (bucket: iron-gym-media)
      │
      ├── exercises/bench-press.mp4
      ├── exercises/bench-press.jpg          (poster)
      ├── exercises/squat.mp4
      ├── exercises/squat.jpg
      └── ...
```

Клиент собирает URL через хелпер из [`src/config/store.ts`](../src/config/store.ts):

```ts
exerciseVideoUrl('bench-press')  // https://storage.yandexcloud.net/iron-gym-media/exercises/bench-press.mp4
exerciseThumbUrl('bench-press')  // https://storage.yandexcloud.net/iron-gym-media/exercises/bench-press.jpg
```

Сменить бакет/CDN можно без пересборки — достаточно передать `EXPO_PUBLIC_MEDIA_URL` при `eas build`.

## Шаг 1. Настройка Yandex Object Storage

1. Зарегистрироваться в <https://cloud.yandex.ru/> через Яндекс ID. Бесплатный грант 4000 ₽ на 60 дней (хватит на долго).
2. В консоли: **Object Storage → Создать бакет**.
   - Имя: `iron-gym-media`
   - Макс. размер: 10 ГБ (можно меньше, платится по факту — ~1 ₽ за ГБ в месяц)
   - Класс хранилища: **Стандартное**
   - Доступ: **Публичный на чтение** (важно, чтобы клиент видел видео без токена)
3. Создать сервисный аккаунт для загрузки:
   - **IAM → Сервисные аккаунты → Создать**
   - Роль: `storage.uploader`
   - Создать **статический ключ доступа** — сохранить `key_id` и `secret`.
4. Установить AWS CLI (Yandex Object Storage S3-совместимый):
   ```bash
   aws configure --profile yandex
   # AWS Access Key ID:     <key_id>
   # AWS Secret Access Key: <secret>
   # Default region name:   ru-central1
   # Default output format: json
   ```

## Шаг 2. Подготовка видео

### Рекомендуемые параметры

- **Формат:** MP4, H.264 video + AAC audio (или без звука — видео демонстрации обычно немые)
- **Разрешение:** 720p (1280×720) или 480p (854×480) — 480p экономит 2× трафик при почти неотличимом качестве на мобильном
- **Битрейт:** 800–1200 kbps для 480p, 1500–2500 kbps для 720p
- **Длительность:** 10–20 секунд, зацикленная (выполнение одного повторения 3–5 раз)
- **FPS:** 30
- **Размер файла:** цель 1–3 МБ на видео, максимум 5 МБ

### Команда конвертации через ffmpeg

```bash
# Пример для bench-press.mov (из камеры) в web-optimized MP4 480p
ffmpeg -i bench-press.mov \
  -vf "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -preset slow -crf 24 \
  -c:a aac -b:a 96k \
  -movflags +faststart \
  -y bench-press.mp4
```

`-movflags +faststart` критично — перемещает метаданные в начало файла, чтобы видео начинало играть не дожидаясь полной загрузки.

### Постер (превью-картинка)

Взять один кадр из видео (обычно на 1-й секунде):

```bash
ffmpeg -i bench-press.mp4 -ss 00:00:01 -vframes 1 -q:v 3 bench-press.jpg
```

### Пакетная обработка 71 упражнения

Положите исходники в `~/iron-gym-raw/` с именами `squat.mov`, `deadlift.mov` и т.д., потом:

```bash
#!/bin/bash
mkdir -p ~/iron-gym-processed
for src in ~/iron-gym-raw/*.{mov,mp4,MP4,MOV}; do
  [ -e "$src" ] || continue
  name=$(basename "$src" | sed 's/\.[^.]*$//')
  out_mp4=~/iron-gym-processed/$name.mp4
  out_jpg=~/iron-gym-processed/$name.jpg
  echo "→ $name"
  ffmpeg -loglevel error -i "$src" \
    -vf "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2" \
    -c:v libx264 -preset slow -crf 24 -c:a aac -b:a 96k -movflags +faststart \
    -y "$out_mp4"
  ffmpeg -loglevel error -i "$out_mp4" -ss 00:00:01 -vframes 1 -q:v 3 -y "$out_jpg"
done
echo "Готово. Файлы в ~/iron-gym-processed/"
```

## Шаг 3. Загрузка в бакет

```bash
# Синхронизация всей папки в бакет. Повторный запуск загружает только новое/изменённое.
aws --profile yandex --endpoint-url=https://storage.yandexcloud.net \
  s3 sync ~/iron-gym-processed/ s3://iron-gym-media/exercises/ \
  --cache-control "public, max-age=2592000" \
  --content-type-by-suffix
```

Параметр `Cache-Control: max-age=2592000` (30 дней) — так клиент `expo-video` будет использовать кэш вместо повторной загрузки.

Проверить публичный доступ:
```bash
curl -I https://storage.yandexcloud.net/iron-gym-media/exercises/bench-press.mp4
# HTTP/2 200
# content-type: video/mp4
```

## Шаг 4. Связка с упражнениями в коде

**ID упражнений** в [`src/data/exercises.ts`](../src/data/exercises.ts) используются как имена файлов. То есть для `{ id: 'bench-press', ... }` клиент ожидает файлы:
- `exercises/bench-press.mp4`
- `exercises/bench-press.jpg`

Никаких изменений в `exercises.ts` не требуется — клиент автоматически строит URL. Если видео ещё не загружено, клиент попробует открыть URL, не получит `200 OK`, сработает `onError` и откроется YouTube-фоллбэк.

Для того, чтобы **явно указать URL** (например, если видео с другого источника или с разным именем), используйте поле `videoUrl` в записи упражнения:

```ts
{
  id: 'some-rare-exercise',
  videoUrl: 'https://cdn.example.com/custom-video.mp4',  // overrides the default pattern
  // ...
}
```

## Шаг 5. Production настройка

1. **Переменная окружения в EAS build:**
   В [`eas.json`](../eas.json) для `play`/`appstore`/`rustore` профилей добавить:
   ```json
   "env": {
     "EXPO_PUBLIC_MEDIA_URL": "https://storage.yandexcloud.net/iron-gym-media"
   }
   ```

2. **Yandex Cloud CDN (опционально, ~300 ₽/мес):**
   - Настроить CDN перед бакетом: **Cloud CDN → Создать ресурс → источник = Object Storage bucket**
   - Получить CDN-домен, например `irongym-media.cdn.yandexcloud.net`
   - Обновить `EXPO_PUBLIC_MEDIA_URL` на CDN-домен — клиенту ничего менять не нужно

3. **Мониторинг:**
   - В Object Storage → **Статистика** — видно трафик и хиты. Задать бюджет на оплату.

## Экономика

Бесплатный стартовый грант Yandex Cloud: 4000 ₽ × 60 дней.

Платные тарифы (после гранта):
- Хранение: 1.02 ₽ за ГБ в месяц (71 видео × 2 МБ = ~140 МБ = 0.14 ₽/мес)
- Трафик наружу: 1.20 ₽ за ГБ
- PUT-запросы: 0.40 ₽ за 1000

Пример: 10 000 пользователей × 30 просмотров упражнений/мес × 2 МБ = **600 ГБ трафика = 720 ₽/мес**.
С CDN это упадёт до ~150 ₽/мес за счёт кеширования на edge-узлах.

## Альтернативы Yandex Object Storage

| Сервис | Дислокация | Free tier | Важно |
|--------|------------|-----------|-------|
| **Yandex Object Storage** | РФ | 4000 ₽/60 дней грант | Рекомендуется — соответствует 152-ФЗ |
| VK Cloud Storage | РФ | 15 ГБ free | Аналог Yandex |
| Selectel | РФ (СПб, Москва) | — | Чуть дешевле по трафику, но без грантов |
| Cloudflare R2 | Global | 10 ГБ free | Дёшевый трафик ($0 за egress через CF!), но не в РФ — нарушение 152-ФЗ для российских пользователей |
| Supabase Storage | Global | 1 ГБ free | Не в РФ |

Для старта и тестов — **Yandex Object Storage** по умолчанию. Cloudflare R2 как `dev` альтернатива — бесплатно и быстро, но только для разработки.

## Быстрый способ получить видео без съёмки: стоки Pexels / Pixabay

Для запуска можно не снимать 71 собственное видео, а автоматически скачать подходящие из бесплатных стоковых источников. Лицензии **Pexels License** и **Pixabay Content License** разрешают коммерческое использование без атрибуции.

В репо лежит скрипт [`scripts/fetch-exercise-videos.mjs`](../scripts/fetch-exercise-videos.mjs), который:
1. Читает список упражнений из `src/data/exercises.ts`.
2. Для каждого отправляет поиск в Pexels Videos API.
3. Выбирает видео 480p (ближайшее к целевому разрешению).
4. Скачивает в папку `./exercise-videos-raw/`.

### Как запустить

```bash
# 1) Получите бесплатный ключ Pexels за 30 секунд на pexels.com/api
export PEXELS_API_KEY="ваш_ключ"

# (опционально) ключ Pixabay как fallback если Pexels промахнулся
export PIXABAY_API_KEY="ваш_ключ"

# 2) Скачать все 71 видео
node scripts/fetch-exercise-videos.mjs

# 3) Просмотреть, удалить неподходящие, переименовать и т.д.
#    Для промахов — отредактировать scripts/search-overrides.json и перезапустить
#    (уже скачанные файлы не качаются повторно).

# 4) Нормализовать через ffmpeg
./scripts/process-exercise-videos.sh ./exercise-videos-raw ./exercise-videos-ready

# 5) Загрузить
aws --profile yandex --endpoint-url=https://storage.yandexcloud.net \
  s3 sync ./exercise-videos-ready/ s3://iron-gym-media/exercises/ \
  --cache-control "public, max-age=2592000" --content-type-by-suffix
```

Покрытие: на тестах обычно 60–75% упражнений получают релевантные клипы с первого запуска. Оставшиеся 25–40% обычно фиксятся уточнением поискового запроса в `search-overrides.json` — ключ это ID упражнения, значение — английская фраза для поиска:

```json
{
  "bench-press": "barbell bench press gym",
  "dumbbell-fly": "dumbbell chest fly workout"
}
```

### Гибридный подход

Разумная стратегия для запуска в RuStore:
1. Прогнать скрипт → 50 нормальных видео из стока автоматически.
2. Для 20 оставшихся — снять самому за час (короткие 15-секундные демо, смартфон на штатив).
3. Со временем — заменить стоковые на свои, когда будет время или бюджет на тренера.

## Интеграция с ИИ-генерацией видео

Если стоки не подходят и снимать не хочется:
- **Runway Gen-3** — $15/мес, 10 секунд за промпт, хорошо работает для нейтрального фона
- **Pika Labs** — $10/мес, проще, качество для фитнес-движений среднее
- **Luma Dream Machine** — бесплатный демо-режим, $29/мес полный
- **Sora (OpenAI)** — пока ограниченный доступ, самое высокое качество
- **Stable Video Diffusion** — open-source, надо локальный GPU (минимум 12 GB VRAM)

Типичный промпт для упражнения:
`"top-down view of a person performing {exercise name}, fitness demonstration, neutral grey background, 10 seconds loop, no text, studio lighting"`
