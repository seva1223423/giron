# Scripts

Утилиты для сопровождения приложения Iron Gym.

## `fetch-exercise-videos.mjs` — автоматический сбор видео

Скачивает демо-видео упражнений из бесплатных стоков с коммерческой лицензией.

### Почему так

Альтернативы съёмке 71 собственного видео:
- Снимать с тренером — 1 полный день работы + затраты на оборудование.
- AI-генерация (Runway, Pika, Sora) — $15–30/мес + качество для фитнес-движений пока нестабильно.
- **Стоки Pexels / Pixabay — 5 минут работы скрипта, 0 рублей**, лицензия позволяет коммерческое использование без атрибуции.

Минусы стока: точность совпадения зависит от поискового запроса. Обычно 60–75% попаданий — остальные 25–40% придётся уточнить через [`search-overrides.json`](search-overrides.json) и перезапустить.

### Пошагово

1. **Получить API-ключи (бесплатно, 30 секунд):**
   - Pexels: [pexels.com/api](https://www.pexels.com/api/) — регистрация, Request Key
   - Pixabay (fallback, необязательно): [pixabay.com/api/docs](https://pixabay.com/api/docs/)

2. **Запустить:**
   ```bash
   export PEXELS_API_KEY="…"
   export PIXABAY_API_KEY="…"
   node scripts/fetch-exercise-videos.mjs
   ```
   Файлы падают в `./exercise-videos-raw/`, по одному на каждое упражнение. Повторный запуск скипает уже скачанные.

3. **Просмотреть результат.** Откройте папку, пролистайте видео — где содержимое не подходит, удалите файл.

4. **Уточнить поиски для пропущенных.** Откройте [`search-overrides.json`](search-overrides.json), добавьте/измените строку поиска для проблемных ID и перезапустите — скачаются только недостающие.

5. **Нормализовать** в 480p H.264 с постером (скрипт уже в репо):
   ```bash
   ./scripts/process-exercise-videos.sh ./exercise-videos-raw ./exercise-videos-ready
   ```

6. **Загрузить в Yandex Object Storage** (подробности в [`docs/MEDIA_HOSTING.md`](../docs/MEDIA_HOSTING.md)):
   ```bash
   aws --profile yandex --endpoint-url=https://storage.yandexcloud.net \
     s3 sync ./exercise-videos-ready/ s3://iron-gym-media/exercises/ \
     --cache-control "public, max-age=2592000" --content-type-by-suffix
   ```

7. После успешной заливки клиент автоматически покажет native-видео — никаких изменений в коде не нужно.

### Лицензирование

- **Pexels License** (<https://www.pexels.com/license/>): свободное использование, в том числе коммерческое и без атрибуции. Нельзя продавать сами видео как есть.
- **Pixabay Content License** (<https://pixabay.com/service/license-summary/>): практически идентична.

Хорошим тоном считается упомянуть Pexels и Pixabay в секции "Благодарности" / "Credits" где-нибудь в Настройках или на лендинге — не обязательно, но вежливо.

### Что делать, если ни один сток не подходит

1. Снять самостоятельно одно короткое демо (15 секунд, смартфон на штатив) → положить в `./exercise-videos-raw/{id}.mp4` → пропустить шаг 2.
2. Либо использовать AI-генератор (Runway Gen-3, Pika, Luma Dream Machine) с промптом "top-down view of a person performing {exercise name}, fitness demonstration, neutral background, 10 seconds loop, no text".

---

## `process-exercise-videos.sh` — ffmpeg-пайплайн

Прогоняет исходные .mov/.mp4 через нормализацию:
- 480p landscape с padding если не 16:9
- H.264 veryslow CRF 24 — хорошо сжимает фитнес-движения
- AAC audio 96k (или убирает audio если исходник без звука)
- `-movflags +faststart` для прогрессивной загрузки
- Постер-JPG с 1-й секунды

Использование — в [`docs/MEDIA_HOSTING.md`](../docs/MEDIA_HOSTING.md) и в заголовке самого скрипта.
