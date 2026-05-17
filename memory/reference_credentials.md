---
name: Giron — где лежат креды и какие сервисы используются
description: Где взять ключи для Mistral / DB / JWT / SMTP, что хостится на Render, что на Neon, где EAS
type: reference
originSessionId: 4b576bd1-39bf-4a31-a62b-691aee14f1a5
---
**Глобальный режим:** `~/.claude/settings.json` → `permissions.defaultMode: "bypassPermissions"`. Это совпадает с "доступом ко всему" из VS Code сессий пользователя — специальной настройки больше не требуется.

**Локальный `.env` с ключами** (не в гите, `credentials.json` и `android-keystore.jks` тоже в `.gitignore`):
- Путь: `C:/Users/sevka/Desktop/1223/work/giron/server/.env` (рабочий клон проекта)
- Старого пути `C:/Users/sevka/Projects/giron/` больше нет — проект переехал в `Desktop/1223/work/`
- Способ загрузить в bash: `set -a; source C:/Users/sevka/Desktop/1223/work/giron/server/.env; set +a`

**Сервисы и где их дашборды:**

| Сервис | Что | Доступ из CLI |
|---|---|---|
| Render | Хостинг API, slug `giron-api`, URL `https://giron-api.onrender.com`, Frankfurt free | Автодеплой на `git push` в master. Для API управления нужен Render key — в `.env` нет, создавать в dashboard → Account Settings → API Keys |
| Mistral AI | `https://api.mistral.ai/v1`, модель `mistral-small-latest` | `AI_API_KEY` в `.env`, проверено — `curl -H "Authorization: Bearer $AI_API_KEY"` работает |
| Neon (PostgreSQL) | Host `ep-spring-dew-al4rrzbq-pooler.c-3.eu-central-1.aws.neon.tech`, регион eu-central-1 | `DATABASE_URL` в `.env`. `psql` не установлен — использовать Prisma из `C:/Users/sevka/Desktop/1223/work/giron/server` (там есть node_modules) |
| GitHub | Репо `seva1223423/giron` | `gh` залогинен как `seva1223423`, scopes: repo/workflow/gist/read:org |
| EAS / Expo | owner `memno666`, projectId `8b6fa1fd-4943-4185-bf1a-ea14bc70cfc4` | `eas` установлен, `eas whoami` не залогинен — нужен интерактивный `eas login` |
| Gmail SMTP | `smtp.gmail.com:587`, `SMTP_USER/SMTP_PASS` в `.env` (app password) | curl/Node |
| DeepSeek | Fallback для AI, `https://api.deepseek.com` | Ключ НЕ в `.env` — пользователь использует только Mistral в prod |
| Ollama | Локальный fallback: `qwen2.5:14b` + `llama3.2-vision` для фото еды | Локальный — работает только если запущен на машине пользователя |

**Пустые/неиспользуемые (в `.env` есть переменные, но значения пустые):** RevenueCat/YuKassa/generic webhook secrets, Google OAuth, VK OAuth, SMS.ru, Twilio.

**Автодеплой:** push в `master` → Render пересобирает `server/` (`npm install && npm run build`, затем `npm start`). Env vars хранятся в Render dashboard — `.env` локальный только для разработки.

**Стоит уточнять у пользователя:**
- Render API key — нужен для прямого управления логами/деплоями/env без UI
- `eas login` — нужно только если надо собрать/запушить билд клиента
