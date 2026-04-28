# Iron Gym — Deploy & First-Run Setup

Однократная настройка после следующего пула этого репозитория. Всё что нужно от тебя — один раз. После этого автодеплой Render и обычный workflow `git push` берут на себя остальное.

---

## 0. Быстрая шпаргалка (3 команды)

```powershell
cd C:\Users\sevka\Desktop\1223\work\iron-gym
npm install                                  # подтянуть expo-updates + sentry
cd server && npm install && npx prisma db push && npx prisma generate
```

В Render → Environment добавить **одну переменную**:

```
ADMIN_BOOTSTRAP_EMAIL = osipovvsevolod01@gmail.com
```

После Save Changes Render автоматически перезапустит сервис. Всё. Дальше можно регистрироваться через приложение / curl и работать.

---

## 1. Render env-переменные

### Уже настроены (не трогай)
- `DATABASE_URL` — Neon PostgreSQL
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — токены
- `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` — Mistral
- `PORT=3001`

### Нужно добавить (минимум)

| Key | Value | Зачем |
|---|---|---|
| `ADMIN_BOOTSTRAP_EMAIL` | `osipovvsevolod01@gmail.com` | Юзер с этим email автоматически становится ADMIN при регистрации или на boot |

### Опционально — для email-отчётов (digest, password reset, OTP)

| Key | Value | Зачем |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | Сервер исходящих писем |
| `SMTP_PORT` | `587` | TLS-порт |
| `SMTP_USER` | `osipovvsevolod01@gmail.com` | От кого |
| `SMTP_PASS` | App Password из Google | Не основной пароль аккаунта |
| `SMTP_FROM` | `Iron Gym <osipovvsevolod01@gmail.com>` | Заголовок From |
| `APP_URL` | `https://irongym.app` | База для ссылок в письмах |

App Password создаётся за 1 минуту:
1. https://myaccount.google.com/security → включить 2FA
2. https://myaccount.google.com/apppasswords → создать пароль для "Iron Gym Server"
3. Скопировать 16 символов в `SMTP_PASS`

**Без SMTP** все email-отправки проходят через no-op (молча возвращают success), сервер не падает, в Sentry ничего не льётся. Push-уведомления работают независимо. Но email-отчёты, password reset, верификация email тогда не приходят.

### Опционально — для отлова крэшей

| Key | Value | Зачем |
|---|---|---|
| `SENTRY_DSN` | `https://...@sentry.io/...` | Сервер-сайд ошибки |
| `MIN_CLIENT_VERSION` | `0.0.0` | Минимально поддерживаемая версия клиента. `0.0.0` = выключено |

`EXPO_PUBLIC_SENTRY_DSN` ставится в `eas.json` и привязывается к билду, не к Render env.

### Опционально — социальная авторизация (RU)

| Key | Value | Когда нужно |
|---|---|---|
| `VK_APP_ID` | id из vk.com/editapp | Login через VK |
| `YANDEX_CLIENT_ID` | id из oauth.yandex.ru | Login через Яндекс |
| `MAILRU_CLIENT_ID` | id из portal.mail.ru | Login через Mail.ru |
| `GOOGLE_CLIENT_ID_WEB`, `_IOS`, `_ANDROID` | id из console.cloud.google.com | Login через Google |

Без них соответствующие кнопки просто не показываются на экране логина.

---

## 2. Локальные команды после `git pull`

### Если поменялась `server/prisma/schema.prisma`
```powershell
cd C:\Users\sevka\Desktop\1223\work\iron-gym\server
npx prisma db push       # синхронизация схемы с БД на Neon
npx prisma generate      # обновление TypeScript типов Prisma client
```

### Если поменялся `package.json`
```powershell
cd C:\Users\sevka\Desktop\1223\work\iron-gym
npm install              # клиент
cd server
npm install              # сервер
```

### Если поменялся `eas.json` или `app.json`
Перед следующим `eas build` команды не нужны — EAS сам подхватит изменения.

---

## 3. Проверка после деплоя

После того как Render показывает зелёный **Live**, проверка одной curl-командой:

```powershell
curl https://iron-gym-swoe.onrender.com/api/admin/digest/readiness
```

Ответ должен содержать:
- `adminCount` — сколько админов в БД (должно быть ≥1 после регистрации)
- `bootstrapEmailRegistered` — найден ли юзер с `ADMIN_BOOTSTRAP_EMAIL`
- `smtpConfigured` — `true` если SMTP_HOST/USER/PASS все настроены
- `readyForNextDigest` — `true` когда оба условия выполнены и завтра в 09:00 МСК digest придёт

Если `readyForNextDigest: false` — JSON покажет в `admins` массиве конкретного юзера и почему он не получит digest (нет email, нет push token, etc.).

---

## 4. Регистрация admin-юзера через API

Если приложения ещё нет на телефоне, регистрация через curl:

```powershell
curl.exe -X POST https://iron-gym-swoe.onrender.com/api/auth/register `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"osipovvsevolod01@gmail.com\",\"password\":\"YourPass2026\",\"firstName\":\"Sevka\"}"
```

Поскольку email совпадает с `ADMIN_BOOTSTRAP_EMAIL`, юзер сразу создаётся как ADMIN. В ответе будет `token` — это JWT для последующих запросов.

После этого можно вручную дёрнуть digest:

```powershell
curl.exe -X POST https://iron-gym-swoe.onrender.com/api/admin/digest/send-now `
  -H "Authorization: Bearer <твой-JWT>"
```

Получишь push (если приложение установлено) + email (если SMTP настроен).

---

## 5. OTA-обновления (после публикации первой версии в RuStore)

### Обычное обновление JS/TS-кода
```powershell
git push origin master
# Render автодеплоит сервер ~3-5 минут
eas update --channel production --message "Что поменял"
# OTA обновление прилетит во все установленные APK при следующем запуске
```

### Когда поменялись native-зависимости (новые plugins, native-модули)
```powershell
# 1. Бамп version в app.json: 1.0.0 → 1.1.0
# 2. Новая сборка APK:
eas build --platform android --profile rustore
# 3. Заливка в RuStore
```

Старые APK останутся на своём bundle (защита через `runtimeVersion.policy: appVersion`).

### Force-update для старых APK (если новая API ломает их)
В Render env: `MIN_CLIENT_VERSION=1.1.0`. Сервер сразу начнёт отвечать 426 на запросы от APK 1.0.x. На клиенте `ForceUpdateModal` (root компонент) покажет non-dismissible экран «Обнови приложение» с deep-link в RuStore.

---

## 6. Daily admin digest — проверка работы

Cron `06:00 UTC = 09:00 МСК`. Каждый день автоматически:
- Push на лок-скрин: «📊 Iron Gym — 2026-04-28 · Платят: 247 (+3 за 30д) · Регистраций: 12 (+2) · Тренировок: 89 (-5) · Активация: 42%»
- Email с цвето-кодированными дельтами и большой картой «ПЛАТЯТ СЕЙЧАС»

Тап по push открывает `irongym://admin/metrics-key` → экран с пятью числами (платящие, churn, ARPU, активация, signup→paid воронка).

---

## 7. Что НЕ нужно настраивать сейчас

Backlog ≥6 месяцев — не трогать пока MRR не дойдёт до 200-500k ₽:

- Apple Developer Program / iOS
- B2B-тренеры (отдельный продукт со своим PMF)
- Армения / Astana Hub / оффшор
- Bortnik грант
- IP-регистрация / товарный знак
- Английская версия / международный рынок
- Web-версия
- Конференции / PR / подкасты
- Major refactor / типизация на всё / тесты на всё

---

## 8. Контакты / debug

- Render dashboard: https://dashboard.render.com → My project → Iron Gym
- GitHub: https://github.com/seva1223423/iron-gym
- Sentry (после активации): https://sentry.io
- Health check live: https://iron-gym-swoe.onrender.com/health
- Health check deep (DB + LLM): https://iron-gym-swoe.onrender.com/health/deep
