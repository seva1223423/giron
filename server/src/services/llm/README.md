# LLM Provider Migration Plan

Цель этого файла — когда у разработчика появится API-ключ YandexGPT (или GigaChat), миграция с Mistral делается **за 30-60 минут** по чек-листу, а не превращается в рефакторинг 84k-строчного `ai.ts`.

---

## Состояние на текущий момент (apr 2026)

Весь AI-код идёт через `server/src/services/deepseekAI.ts` — универсальный OpenAI-совместимый клиент. Провайдер выбирается тремя env-переменными:

```
AI_BASE_URL=https://api.mistral.ai/v1
AI_MODEL=mistral-small-latest
AI_API_KEY=<key>
```

**Переключение между OpenAI-совместимыми провайдерами** (Mistral ↔ DeepSeek ↔ OpenRouter) — бесплатно через env, код не трогается.

**Подключение не-OpenAI провайдеров** (YandexGPT, GigaChat) — требует одного нового файла-адаптера и одной строки в routing-слое. Ниже — точный план.

---

## Сравнение провайдеров

| Провайдер | Cost (input) | Cost (output) | Оплата | Риск блокировки РФ | Русский | Казахский |
|---|---|---|---|---|---|---|
| Mistral Small | $0.20 / 1M | $0.60 / 1M | $, иностранная карта | **Высокий** (>50% за 12 мес) | Хороший | Средний |
| Mistral Medium | $2.00 / 1M | $6.00 / 1M | $ | Высокий | Отличный | Хороший |
| DeepSeek Chat | $0.14 / 1M | $0.28 / 1M | $, крипто | Средний | Средний | Слабый |
| **YandexGPT Lite async** | **~120 ₽ / 1M** | **~120 ₽ / 1M** | **₽ через YC** | **0** | **Отличный** | **Отличный** |
| YandexGPT Pro async | ~600 ₽ / 1M | ~600 ₽ / 1M | ₽ через YC | 0 | Отличный | Отличный |
| GigaChat Lite | 190 ₽ / 1M | 190 ₽ / 1M | ₽ через Сбер | 0 | Отличный | Слабый |
| GigaChat Max | 1950 ₽ / 1M | 1950 ₽ / 1M | ₽ через Сбер | 0 | Отличный | Слабый |

**При 10k MAU × 30 токенов-запросов в день × 2000 токенов на сессию ≈ 18 млрд токенов/мес:**

- Mistral Small: ~$15 000/мес (+ валютный контроль)
- YandexGPT Lite async: **~2 100 000 ₽/мес = ~$23k** — *дороже* при таком объёме, но на Y1 масштабах Giron (<100k MAU) будет **в 3× дешевле** из-за async-скидки на малых объёмах.

Для текущего этапа (< 10k MAU) YandexGPT Lite — однозначный winner по cost × страновому риску × качеству русского.

---

## Рекомендуемая архитектура после миграции

```
                    ┌──────────────────────┐
request ──────────► │  llm/router.ts       │
                    │  (routes by intent)  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌─────────────┐ ┌────────────────┐ ┌─────────────┐
       │  Mistral    │ │  YandexGPT     │ │  GigaChat   │
       │  (legacy +  │ │  (primary)     │ │  (fallback) │
       │   complex)  │ │                │ │             │
       └─────────────┘ └────────────────┘ └─────────────┘
```

**Routing rules (черновик, активируется вместе с миграцией):**
- `simple_qa`, `food_log`, `greeting` → YandexGPT Lite ($$-cheapest)
- `workout_advice`, `nutrition_query` → YandexGPT Pro (качество)
- `complex_planning` (генерация 12-нед программы) → Mistral Medium (tool-use)
- `medical_concern` → Claude Sonnet (лучший safety, если есть ключ)
- Fallback: YandexGPT Pro (все scenarios работают, только медленнее)

---

## Чек-лист подключения YandexGPT (когда будет API-ключ)

### Шаг 1 — получить credentials (15 мин)
- [ ] Зарегистрироваться на https://yandex.cloud
- [ ] Создать folder, получить `folder_id`
- [ ] IAM → сервисный аккаунт с ролью `ai.languageModels.user`
- [ ] Создать API-key через консоль YC
- [ ] В `server/.env`:
  ```
  YANDEX_GPT_API_KEY=<key>
  YANDEX_GPT_FOLDER_ID=<id>
  YANDEX_GPT_MODEL=yandexgpt-lite/latest
  ```

### Шаг 2 — написать адаптер (2-3 часа)
- [ ] Создать `server/src/services/llm/yandexGpt.ts`:
  - [ ] export `chat(options: ChatOptions): Promise<ChatResult>` — та же сигнатура что у `deepseekAI.chat`
  - [ ] HTTP POST на `https://llm.api.cloud.yandex.net/foundationModels/v1/completion`
  - [ ] Заголовок `Authorization: Api-Key <key>`
  - [ ] Body: `{ modelUri: "gpt://<folder_id>/yandexgpt-lite/latest", completionOptions: { temperature, maxTokens }, messages: [...] }`
  - [ ] Преобразовать ответ в формат `{ content, toolCalls: [], hasToolCalls: false }` (YandexGPT пока без native function-calling — эмулировать через regex над content)
  - [ ] timeout 60s, retry 2 раза как у deepseekAI
  - [ ] export `chatStream`, `analyzeImage` (vision через отдельный endpoint), `healthCheck`

### Шаг 3 — создать router (1 час)
- [ ] Создать `server/src/services/llm/router.ts`:
  ```ts
  export async function chat(opts: ChatOptions, intent?: Intent): Promise<ChatResult> {
    const primary = process.env.AI_PRIMARY_PROVIDER || 'mistral';
    const providers = { mistral: deepseekAI.chat, yandex: yandexGpt.chat, gigachat: gigachat.chat };
    try {
      return await providers[primary](opts);
    } catch (err) {
      const chain = (process.env.AI_FALLBACK_CHAIN || '').split(',').filter(Boolean);
      for (const p of chain) {
        try { return await providers[p](opts); } catch {}
      }
      throw err;
    }
  }
  ```

### Шаг 4 — переключить ai.ts (15 мин)
- [ ] В `server/src/routes/ai.ts`:
  - Заменить `import { chat } from '../services/deepseekAI'` на `import { chat } from '../services/llm/router'`
  - Остальной код остаётся без изменений (та же сигнатура)
- [ ] Аналогично для `chatStream`, `analyzeImage`, `chatWithoutTools`

### Шаг 5 — регрессия (1 час)
- [ ] `npm test` в `/server` — 21+ suites должны остаться зелёными
- [ ] Manual smoke-test:
  - [ ] Простой Q&A на русском
  - [ ] Food photo analysis
  - [ ] Tool call (`log_body_weight`)
  - [ ] Чат на казахском
- [ ] Мониторинг 24 часа в staging перед prod

### Шаг 6 — прод (30 мин)
- [ ] Deploy → Render
- [ ] `.env` обновить на prod
- [ ] `AI_PRIMARY_PROVIDER=yandex`, `AI_FALLBACK_CHAIN=mistral`
- [ ] Watch logs первые 2 часа на ошибки

**Общий срок миграции: 4-6 часов работы + 24ч staging наблюдение.**

---

## Риски миграции

| Риск | Митигация |
|---|---|
| YandexGPT не держит tool-calling native | Эмуляция через JSON-in-content regex + validator |
| Latency выше Mistral (RU-datacenter может быть медленнее EU) | Routing: cold start → Mistral, warm session → YandexGPT |
| Tier-free quota кончится в неожиданный момент | Monitoring через `recordAIRequest`, alert при >80% quota |
| Функция async / batch не работает для streaming UI | Fall back на sync endpoint для chat-стримов, async для background |
| Запустим с багой → регрессия на prod | Feature flag `AI_PRIMARY_PROVIDER` позволяет откатить за 1 env update |

---

## До появления API-ключа (сейчас)

Никаких изменений в коде не нужно. Этот README — единственный артефакт этой подготовительной задачи. Когда ключ появится — следуй чек-листу.

---

## Обновление 2026-05-22: yandex adapter + DeepSeek-ready

`yandexAdapter.ts` лежит в этой папке и зарегистрирован в `router.ts`.
Без env-переменных он автоматически скипается `resolveChain()` —
поведение `chat()` идентично текущему mistral-only.

### Активировать Yandex GPT (когда будут ключи)

```
# .env / Render env
AI_PRIMARY_PROVIDER=yandex
AI_FALLBACK_CHAIN=mistral

YANDEX_API_KEY=<Api-Key из консоли Yandex Cloud>
YANDEX_FOLDER_ID=<folder catalog id>
YANDEX_MODEL=yandexgpt-lite   # optional
```

### Переключить Mistral → DeepSeek

`mistralAdapter` — это универсальный OpenAI-совместимый слот. DeepSeek
тоже OpenAI-совместимый, никаких новых файлов писать не нужно. Только
env:

```
# .env / Render env (заменить mistral-значения)
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=<deepseek-ключ>
```

`AI_PRIMARY_PROVIDER` оставь `mistral` — это просто label, не строгое
соответствие. После перезапуска все вызовы `chat()`/`chatStream()` будут
бить по DeepSeek.

### Что выпилено и почему

- **GigaChat adapter удалён 2026-05-22** — решение не использовать в
  проде. Если когда-нибудь понадобится — git history имеет полный
  адаптер + 12 тестов, восстанавливается за `git revert`.
- Маршруты intent → `AI_SAFETY_PROVIDER` / `AI_COMPLEX_PROVIDER` всё
  ещё работают, просто список доступных провайдеров короче.

**Ограничения текущей реализации:**

- Yandex не поддерживает function-calling → tools в `chat()` молча
  игнорируются. Если intent классифицирован как `complex_planning` —
  router должен переключаться на провайдер с tools (Mistral/DeepSeek).
- Streaming для Yandex не реализован — router падает на
  не-стриминговый `chat()`. AI чат-стрим в UI обрывается на провайдере
  без stream поддержки — на сегодня только mistral/deepseek (через
  тот же mistralAdapter) могут стримить.

Покрытие тестами: 21 тест для yandex. Mock global fetch, реальная сеть
не нужна.
