# Sentry — пошаговая настройка

Цель: после следующего деплоя сервер начнёт отправлять все ошибки в Sentry, и ты будешь видеть их в дашборде с stack trace, breadcrumbs и контекстом юзера.

**Время:** 4 минуты.
**Стоимость:** бесплатно (5000 ошибок в месяц на free tier — больше чем нужно для первых месяцев работы).

---

## Что такое Sentry в двух словах

Когда что-то падает на сервере (или в приложении на телефоне юзера) — без Sentry ошибка пишется только в console, потом забывается. Ты узнаёшь о проблеме только когда юзер пожалуется. **С Sentry** каждая ошибка моментально попадает в дашборд: видишь когда упало, на каком юзере, какой роут, полный stack trace, что юзер делал перед этим.

---

## Шаг 1. Регистрация на Sentry (1 минута)

1. Открой https://sentry.io/signup/ → Sign up
2. Выбери **Sign in with GitHub** (быстрее всего)
3. Заполни org name: `giron` или любое
4. Choose plan: **Free** (Developer)

---

## Шаг 2. Создать проект для сервера (1 минута)

После регистрации Sentry попросит создать первый проект.

1. Platform: выбери **Node.js → Express**
2. Project name: `giron-server`
3. Default alert frequency: **Alert me on every new issue** (или что предлагают)
4. Жми **Create Project**

Sentry откроет страницу с инструкциями. **Тебе нужна только одна вещь** — DSN. Это строка вида:
```
https://abc123def456@o0000000.ingest.sentry.io/4500000000000000
```

Скопируй её целиком.

---

## Шаг 3. Добавить DSN в Render (1 минута)

1. Открой https://dashboard.render.com → My project → giron
2. В левом меню → **Environment**
3. Прокрути вниз до **Environment Variables** → клик **Edit** (карандаш)
4. Жми **+ Add variable**
5. Заполни:
   - **Key:** `SENTRY_DSN`
   - **Value:** (вставь DSN из Sentry, целиком)
6. Жми **Save, rebuild, and deploy** внизу

Render автоматически перезапустит сервер.

---

## Шаг 4. Проверить что работает (1 минута)

После того как Render показывает зелёный **Live** (~3-5 минут), открой в браузере:

```
https://iron-gym-swoe.onrender.com/health/sentry
```

Должен вернуть JSON:
```json
{
  "sentryDsnConfigured": true,
  "dsnHost": "o0000000.ingest.sentry.io",
  "nodeEnv": "production",
  "note": "A test error has been routed through reportError. Check sentry.io within 30s."
}
```

`sentryDsnConfigured: true` → DSN подхватился. И эндпоинт автоматически послал тестовую ошибку в Sentry.

Через 30 секунд зайди на https://sentry.io → твой проект `giron-server` → должно появиться issue `[health/sentry] init probe`. Это значит **Sentry полностью работает**.

Если issue появилось — можешь его удалить (это синтетическая ошибка, не реальная).

---

## (Опционально) Шаг 5. Sentry для клиента (мобильное приложение)

Это делается через EAS Secret чтобы DSN не валялся в репозитории. Только если планируешь смотреть крэши с телефонов юзеров (рекомендуется).

### 5а. Создай отдельный Sentry-проект для React Native

1. На sentry.io → **Projects** → **Create Project**
2. Platform: **React Native**
3. Project name: `giron-mobile`
4. **Create Project** → копируй DSN

### 5б. Добавь DSN как EAS Secret

В терминале на твоём ПК:

```powershell
cd C:\Users\sevka\Desktop\1223\work\giron
npx eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "https://abc123@o0000000.ingest.sentry.io/4500000000000000" --type string
```

(подставь свой DSN из шага 5а в `--value`)

Готово. На следующей сборке `eas build` Sentry автоматически активируется в APK. Никаких других правок не нужно — `errorReporter` я уже подключил в `App.tsx` ещё в Phase-0.

---

## Что попадает в Sentry автоматически

После того как DSN настроен, **без дополнительных правок кода**:

**Сервер:**
- Все 500-е ошибки в Express handlers
- Unhandled promise rejections
- Uncaught exceptions
- Cron-фейлы (cleanup, retention, digest)
- AI-роут errors с расшифровкой intent + userId
- Prompt-injection попытки с patterns

**Клиент (после Шага 5):**
- React render крэши через ErrorBoundary
- Unhandled promise rejections в screens
- Network errors
- Native crashes (требует EAS dev build, не Expo Go)

В каждом issue будет:
- Stack trace
- userId (без email/имени — PII скрабится)
- Route (`POST /api/ai/chat`)
- Tags (`origin: 'retention-cron'`)
- Breadcrumbs последних действий юзера

---

## Что **не** попадает в Sentry (PII protection)

Сервер автоматически вычищает из payloads:
- Пароли, токены, refresh tokens
- Healthcare data (вес, рост, цели, ограничения здоровья) — это спец-категория под 152-ФЗ
- Заголовки авторизации
- Cookies / session данные

Это уже встроено в `errorReporter.ts` через `beforeSend` hook. Не нужно вручную фильтровать.

---

## Если что-то не работает

**`sentryDsnConfigured: false` после шага 4:**
- Проверь что в Render env переменная называется именно `SENTRY_DSN` (не `SENTRY_DNS`, не `SENTRY-DSN`)
- Подожди ещё 1-2 минуты — иногда Render показывает **Live** до того как новый процесс реально подхватил env

**Issue не появляется в Sentry дашборде:**
- DSN мог быть скопирован с лишним пробелом — пересоздай в Render
- Проверь что в правом верхнем углу sentry.io выбран правильный проект (`giron-server`, не `giron-mobile`)

**`@sentry/node` не установлен на сервере:**
Должен быть. Если по какой-то причине нет — выполни на Render через Settings → Build Command:
```
npm install && npx prisma generate && tsc --skipLibCheck
```
Сейчас уже стоит правильное `npm run build` который делает `prisma generate && tsc`.

---

## Стоимость

Free tier Sentry: **5000 errors/month**. Для проекта с 0-1000 пользователями этого хватит. Если упрёшься в лимит — Sentry начнёт rate-limit'ить, но НЕ начнёт списывать деньги (это hard limit, не soft).

Платный план **$26/month** — 50k errors. Имеет смысл когда MRR ≥200k ₽ и реально упёрся в лимит free.
