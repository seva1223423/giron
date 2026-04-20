# Blender-rendered exercise videos

Полностью автономный пайплайн: процедурно собирает низкополигонального человечка из примитивов, применяет keyframed-анимацию из JSON, рендерит 480p MP4 через EEVEE Next. Никаких внешних ассетов, никаких API-ключей. Работает на машине пользователя где установлен Blender 4.2+.

## Быстрый старт

```bash
# Windows (адаптируйте путь к blender.exe под свою установку):
BLENDER="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"

# Один тестовый рендер
"$BLENDER" --background \
  --python scripts/blender/render_exercise.py -- \
  --exercise squat \
  --output ./exercise-videos-rendered/squat.mp4

# Все упражнения из exercise-animations.json разом
"$BLENDER" --background \
  --python scripts/blender/render_all.py -- \
  --output-dir ./exercise-videos-rendered --skip-existing
```

Первый запуск одного упражнения занимает ~2 минуты c Mixamo-моделью (72 фрейма × ~1.4 сек EEVEE sample) или ~3 минуты с капсульным стик-фигуром. Батч из 71 упражнения — порядка 2–3.5 часов. На GPU-рендере в 3–5 раз быстрее.

## Два варианта рендерера

Есть два рендера, оба читают один и тот же `exercise-animations.json`:

| Скрипт | Персонаж | Качество | Зависимости |
|---|---|---|---|
| `render_exercise.py` | Капсульный stick-figure (процедурно из примитивов) | Схематичное | только Blender |
| `render_exercise_mixamo.py` | Mixamo Xbot (полноценный skinned humanoid с текстурами) | Реалистичное | нужен `assets/3d/xbot.glb` |

**Рекомендация — использовать mixamo-рендерер**. Первый раз скачайте модель:
```bash
bash scripts/blender/fetch-character.sh
```
(2.9 МБ, Xbot из three.js examples, mixamorig-скелет, бесплатная для коммерческого использования под Mixamo EULA).

Батч по умолчанию тоже использует mixamo-рендерер — опция `--renderer capsule` переключает на процедурный.

## Формат анимаций (`exercise-animations.json`)

Каждое упражнение — запись со списком keyframe'ов:

```json
{
  "squat": {
    "duration": 3.0,
    "keyframes": [
      { "t": 0.0, "parts": { "Root": {"loc_z": 0}, "Thigh_R": {"rot_x": 0}, ... }},
      { "t": 0.75, "parts": { "Root": {"loc_z": -0.32}, "Thigh_R": {"rot_x": 75}, ... }},
      ...
    ]
  }
}
```

### Доступные части тела

| Имя | Описание |
|---|---|
| `Root` | Пивот на уровне бёдер. Основное место для `loc_z` (приседания/подъёмы) и `loc_y` (положение на полу) |
| `Torso` | Туловище. `rot_x` — наклон вперёд |
| `Head` | Голова |
| `UpperArm_R`, `UpperArm_L` | Плечи. `rot_x` > 0 — рука вперёд, > 90 — над головой |
| `Forearm_R`, `Forearm_L` | Предплечья (родитель — UpperArm). `rot_x` — сгибание в локте |
| `Thigh_R`, `Thigh_L` | Бёдра. `rot_x` > 0 — шаг вперёд |
| `Shin_R`, `Shin_L` | Голени (родитель — Thigh). `rot_x` < 0 — сгибание в колене |

Все углы — в градусах. `loc_*` — в метрах (человечек 1.75 м).

### Трансформации в keyframe

```
"Имя_Части": {
  "loc_x": <смещение в метрах>,
  "loc_y": <...>,
  "loc_z": <...>,
  "rot_x": <градусы>,
  "rot_y": <...>,
  "rot_z": <...>
}
```

Пропущенные поля = 0 (rest pose).

## Workflow добавления нового упражнения

1. **Придумайте анимацию** — раскладываете движение на 3–5 фаз (старт → нижняя точка → верх → нижняя точка → старт для 2 репов).
2. **Добавьте в `exercise-animations.json`** запись с `id` совпадающим с `id` в [`src/data/exercises.ts`](../../src/data/exercises.ts).
3. **Тестовый рендер**:
   ```bash
   "$BLENDER" --background --python scripts/blender/render_exercise.py -- \
     --exercise my-new-exercise --output ./exercise-videos-rendered/my-new-exercise.mp4
   ```
4. Откройте получившийся mp4, проверьте.
5. Если не нравится — подправьте углы в JSON, перезапустите (с `--skip-existing` это дешёво).

## Интеграция с хостингом видео

После батч-рендера:

```bash
# Нормализация уже не нужна — render уже выдаёт 480p H.264 MP4.
# Сразу заливаем в Yandex Object Storage:
aws --profile yandex --endpoint-url=https://storage.yandexcloud.net \
  s3 sync ./exercise-videos-rendered/ s3://iron-gym-media/exercises/ \
  --cache-control "public, max-age=2592000" --content-type-by-suffix
```

Клиент автоматически подхватит через хелпер `exerciseVideoUrl(id)` из [`src/config/store.ts`](../../src/config/store.ts) — никаких изменений в коде не требуется.

## Ограничения

- Человечек стилизованный, не фотореалистичный. Подойдёт для схематичной демонстрации формы выполнения, не для коуч-видео.
- Камера фиксированная (сбоку). Для разных упражнений разный ракурс пока не поддерживается.
- Нет лица / текстур / одежды кроме плоских цветов.
- Анимации надо писать вручную — LLM не может mocap-данные генерировать.

Если нужна более качественная картинка — те же keyframes можно будет прокинуть на реального rigged-персонажа (Mixamo / Ready Player Me) — понадобится перенаправить бонусы на armature'у (изменения в render_exercise.py, но JSON не меняется).

## Пример получившегося видео

После теста инфраструктуры на локальной машине разработчика получены три рендера:
- `squat.mp4` — 77 KB, 3.0 сек, 2 повтора приседания.
- `push-ups.mp4` — схожий размер, 2 отжимания от пола.
- `deadlift.mp4` — 2 становых тяги.

Все три попадают в папку `./exercise-videos-test/` (или `./exercise-videos-rendered/` по умолчанию).
