/**
 * AI Service — универсальный OpenAI-совместимый клиент
 *
 * Работает через fetch — никаких внешних SDK.
 * Провайдер задаётся через .env — переключение без изменения кода:
 *
 * Mistral (сейчас, бесплатно):
 *   AI_BASE_URL=https://api.mistral.ai/v1
 *   AI_MODEL=mistral-small-latest
 *   AI_API_KEY=<mistral_key>
 *
 * DeepSeek (продакшен, $0.14/1M токенов):
 *   AI_BASE_URL=https://api.deepseek.com
 *   AI_MODEL=deepseek-chat
 *   AI_API_KEY=<deepseek_key>
 */

import { logger } from '../utils/logger';
import { recordAIRequest } from '../utils/aiMetrics';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeepSeekTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ChatOptions {
  system: string;
  messages: DeepSeekMessage[];
  tools?: DeepSeekTool[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  hasToolCalls: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.mistral.ai/v1';
const DEFAULT_MODEL = process.env.AI_MODEL || 'mistral-small-latest';
const REQUEST_TIMEOUT_MS = 60_000; // 60 секунд на запрос
const MAX_RETRIES = 2; // Повторы при ошибках сети/5xx
const RETRY_DELAY_MS = 1500;

function getApiKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error('AI_API_KEY не задан в .env');
  return key;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** fetch с таймаутом */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Задержка для retry */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Безопасный парсинг JSON из tool call arguments (DeepSeek/Mistral иногда ломают JSON) */
function safeParseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    // Попробуем исправить типичные ошибки DeepSeek: trailing commas, одинарные кавычки
    try {
      const fixed = raw
        .replace(/,\s*}/g, '}')           // trailing comma перед }
        .replace(/,\s*]/g, ']')           // trailing comma перед ]
        .replace(/'/g, '"')               // одинарные кавычки → двойные
        .replace(/(\w+)\s*:/g, '"$1":')   // ключи без кавычек
        .replace(/""(\w+)""/g, '"$1"');   // двойные кавычки
      return JSON.parse(fixed);
    } catch {
      logger.error('Failed to parse tool arguments:', raw);
      return {};
    }
  }
}

/** Грубая оценка токенов (1 токен ≈ 4 символа для русского текста, ~3.5 для английского) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Обрезка истории сообщений чтобы влезть в контекст */
export function trimHistory(
  messages: DeepSeekMessage[],
  maxTokens: number,
  systemTokens: number,
): DeepSeekMessage[] {
  const available = maxTokens - systemTokens - 2000; // запас на ответ
  if (available <= 0) return messages.slice(-2); // только последние 2 сообщения

  let totalTokens = 0;
  const result: DeepSeekMessage[] = [];

  // Идём с конца (новые сообщения важнее)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const tokens = estimateTokens(msg.content || '');
    if (totalTokens + tokens > available && result.length >= 2) break;
    totalTokens += tokens;
    result.unshift(msg);
  }

  return result;
}

// ─── Chat (text + tool calling) ──────────────────────────────────────────────

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const model = options.model || DEFAULT_MODEL;

  const messages: DeepSeekMessage[] = [
    { role: 'system', content: options.system },
    ...options.messages,
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getApiKey()}`,
  };

  let lastError: Error | null = null;
  const callStart = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${AI_BASE_URL}/chat/completions`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        REQUEST_TIMEOUT_MS,
      );

      // 429 (rate limit) или 5xx — retry с задержкой
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : NaN;
        const delay = Math.max(RETRY_DELAY_MS, Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : RETRY_DELAY_MS * (attempt + 1));
        logger.warn(`AI API ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        // Error is recorded in the catch block — no double-record here
        throw new Error(`AI API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason?: string;
        }>;
      };

      const msg = data.choices?.[0]?.message || {};
      const rawToolCalls = msg.tool_calls || [];

      // Безопасный парсинг tool call arguments
      const toolCalls = rawToolCalls
        .map((tc) => {
          const args = safeParseToolArgs(tc.function.arguments);
          // Пропускаем tool calls с пустыми аргументами (ошибка парсинга)
          if (Object.keys(args).length === 0 && tc.function.arguments.trim().length > 2) {
            logger.warn(`Skipping malformed tool call: ${tc.function.name}, raw: ${tc.function.arguments}`);
            return null;
          }
          return { id: tc.id, name: tc.function.name, arguments: args };
        })
        .filter((tc): tc is NonNullable<typeof tc> => tc !== null);

      const latencyMs = Date.now() - callStart;
      // Record successful non-cache call with latency (token estimate based on response length)
      const tokensEstimate = Math.ceil(((msg.content || '').length + JSON.stringify(rawToolCalls).length) / 4);
      recordAIRequest({ cacheHit: false, latencyMs, tokensEstimate });

      return {
        content: msg.content || '',
        toolCalls,
        hasToolCalls: toolCalls.length > 0,
      };
    } catch (err) {
      lastError = err as Error;

      // AbortError = таймаут; TypeError/fetch errors = сеть — retry
      const isRetryable = (err as Error).name === 'AbortError' ||
        (err as Error).message?.includes('fetch') ||
        (err as Error).message?.includes('ECONNREFUSED') ||
        (err as Error).message?.includes('ETIMEDOUT');

      if (isRetryable && attempt < MAX_RETRIES) {
        logger.warn(`AI API network error, retry ${attempt + 1}/${MAX_RETRIES}: ${(err as Error).message}`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      recordAIRequest({ cacheHit: false, error: true });
      throw err;
    }
  }

  throw lastError || new Error('AI API: все попытки исчерпаны');
}

// ─── Chat without tools (fallback) ──────────────────────────────────────────

export async function chatWithoutTools(options: Omit<ChatOptions, 'tools'>): Promise<string> {
  const result = await chat({ ...options, tools: undefined });
  return result.content;
}

// ─── History summarization ──────────────────────────────────────────────────

/**
 * Сжимает длинную историю чата в компактное резюме + последние N сообщений.
 * Вместо обрезки старых сообщений — суммаризирует их, сохраняя контекст.
 *
 * Стратегия:
 * - Если сообщений <= keepRecent — возвращаем как есть
 * - Иначе: старые сообщения → AI-резюме, затем последние keepRecent сообщений
 */
export async function summarizeHistory(
  messages: DeepSeekMessage[],
  maxTokens: number,
  systemTokens: number,
  keepRecent: number = 6,
): Promise<DeepSeekMessage[]> {
  // Если сообщений мало — просто trim
  if (messages.length <= keepRecent) {
    return trimHistory(messages, maxTokens, systemTokens);
  }

  const recentMessages = messages.slice(-keepRecent);
  const olderMessages = messages.slice(0, -keepRecent);

  // Проверяем нужно ли вообще суммаризировать (если старых сообщений мало по токенам — не надо)
  const olderTokens = olderMessages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
  if (olderTokens < 500) {
    // Мало текста — просто объединим всё
    return trimHistory(messages, maxTokens, systemTokens);
  }

  // Формируем текст старых сообщений для суммаризации
  const olderText = olderMessages
    .map((m) => `${m.role === 'user' ? 'Пользователь' : 'Тренер'}: ${m.content || '[действие]'}`)
    .join('\n');

  try {
    const summary = await chatWithoutTools({
      system: 'Ты — ассистент для сжатия диалогов. Сделай краткое резюме беседы между пользователем и AI-тренером. Сохрани: ключевые факты, решения, данные (вес, программа, цели), контекст. Формат: 2-4 предложения на русском. Только факты, без вводных слов.',
      messages: [{ role: 'user', content: `Сожми этот диалог в краткое резюме:\n\n${olderText}` }],
      maxTokens: 256,
      temperature: 0.3,
    });

    // Вставляем резюме как системное сообщение перед последними сообщениями
    const summaryMessage: DeepSeekMessage = {
      role: 'user',
      content: `[Краткое резюме предыдущей беседы: ${summary}]`,
    };

    const result = [summaryMessage, ...recentMessages];
    return trimHistory(result, maxTokens, systemTokens);
  } catch (e) {
    // Если суммаризация сломалась — fallback на обычный trim
    logger.warn('History summarization failed, falling back to trim:', (e as Error).message);
    return trimHistory(messages, maxTokens, systemTokens);
  }
}

// ─── Response validation ────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  shouldRegenerate: boolean;
}

/**
 * Проверяет качество ответа AI и решает нужна ли регенерация.
 * Критерии: пустота, неправильный язык, слишком короткий/длинный,
 * повторы фраз, технический мусор.
 */
export function validateResponse(content: string, userMessage: string): ValidationResult {
  const issues: string[] = [];

  // 1. Пустой или почти пустой ответ
  if (!content || content.trim().length < 10) {
    issues.push('empty_response');
    return { valid: false, issues, shouldRegenerate: true };
  }

  // 2. Ответ на неправильном языке (> 60% латиницы — скорее всего английский)
  const latinChars = (content.match(/[a-zA-Z]/g) || []).length;
  const cyrillicChars = (content.match(/[а-яА-ЯёЁ]/g) || []).length;
  const totalChars = latinChars + cyrillicChars;
  if (totalChars > 50 && latinChars / totalChars > 0.6) {
    issues.push('wrong_language');
    return { valid: false, issues, shouldRegenerate: true };
  }

  // 3. Ответ слишком длинный (> 3000 слов — модель ушла в "поток сознания")
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 3000) {
    issues.push('too_long');
    // Не регенерируем — обрезаем на клиенте
  }

  // 4. Повторяющиеся фразы (признак зацикливания модели)
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);
  if (sentences.length > 4) {
    const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
    const dupeRatio = 1 - uniqueSentences.size / sentences.length;
    if (dupeRatio > 0.4) {
      issues.push('repetitive');
      return { valid: false, issues, shouldRegenerate: true };
    }
  }

  // 5. Технический мусор (JSON-фрагменты, код, XML-теги в ответе для пользователя)
  const techPatterns = [
    /```json[\s\S]{100,}```/,  // длинные JSON-блоки
    /<\/?(?:div|span|html|head|body|script|style)\b/i, // HTML-теги
    /\{"(?:role|content|tool_calls)":/,  // утечка формата сообщений
    /(?:function|const|let|var)\s+\w+\s*[=(]/,  // код JavaScript
  ];
  for (const pattern of techPatterns) {
    if (pattern.test(content)) {
      issues.push('tech_garbage');
      return { valid: false, issues, shouldRegenerate: true };
    }
  }

  // 6. Ответ-отказ (модель отказывается помогать без причины)
  const refusalPatterns = [
    /I (?:cannot|can't|am unable|don't)/i,
    /as an ai (?:language )?model/i,
    /i'm sorry,? (?:but )?i (?:cannot|can't)/i,
  ];
  for (const pattern of refusalPatterns) {
    if (pattern.test(content)) {
      issues.push('english_refusal');
      return { valid: false, issues, shouldRegenerate: true };
    }
  }

  // 6.b. Round 143: Russian refusal patterns. The model occasionally
  // forgets it's Iron Coach and falls back to generic "Я не могу
  // помочь" / "Это выходит за рамки моих компетенций" — these are
  // hallucinated refusals that the user reads as the AI breaking
  // character. Regenerate.
  const russianRefusalPatterns = [
    /(?:^|\.\s+)я\s+не\s+могу\s+помочь/i,
    /(?:^|\.\s+)я\s+не\s+уполномочен/i,
    /это\s+выходит\s+за\s+рамки\s+(?:моих|моей)/i,
    /я\s+(?:всего\s+лишь|просто)\s+(?:искусственный\s+интеллект|языковая\s+модель|ИИ)/i,
    /я\s+не\s+(?:врач|тренер|нутрициолог|специалист)\s+и\s+не\s+(?:могу|должен)/i,
  ];
  for (const pattern of russianRefusalPatterns) {
    if (pattern.test(content)) {
      issues.push('russian_refusal');
      return { valid: false, issues, shouldRegenerate: true };
    }
  }

  // 7. Начинается с запрещённых фраз (из системного промпта)
  const badStarts = ['конечно!', 'отличный вопрос', 'хороший вопрос', 'great question'];
  const lowerStart = content.trim().toLowerCase().slice(0, 30);
  for (const bad of badStarts) {
    if (lowerStart.startsWith(bad)) {
      issues.push('bad_start');
      // Не регенерируем — просто обрезаем начало
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    shouldRegenerate: false,
  };
}

/**
 * Очищает ответ AI от мелких проблем (обрезка плохого начала, усечение длинных ответов).
 */
export function cleanResponse(content: string): string {
  let cleaned = content.trim();

  // Убираем плохие начала. Round 141 expanded coverage: more "fluff"
  // openings the LLM emits especially under low-temperature settings.
  // Each pattern is conservative — strips only when it's the FIRST
  // word/phrase, never mid-sentence.
  const badStartPatterns = [
    /^(?:конечно[!,]?\s*)/i,
    /^(?:отличный\s+вопрос[!,]?\s*)/i,
    /^(?:хороший\s+вопрос[!,]?\s*)/i,
    /^(?:рад\s+помочь[!,]?\s*)/i,
    /^(?:с\s+удовольствием[!,]?\s*)/i,
    // Round 141 additions
    /^(?:безусловно[!,]?\s*)/i,
    /^(?:несомненно[!,]?\s*)/i,
    /^(?:отлично[!,]?\s*)/i,
    /^(?:прекрасно[!,]?\s*)/i,
    /^(?:замечательно[!,]?\s*)/i,
    // "Понимаю" is too ambiguous (often a legitimate sentence opener like
    // "Понимаю тебя") — removed in round 141.1 audit. Original pattern
    // kept commented for diff visibility:
    //   /^(?:понимаю[!,]?\s*)/i,
    /^(?:ах[!,]?\s*понял[!,]?\s*)/i,
    /^(?:давайте\s+(?:разберёмся|посмотрим|начнём)[!,]?\s*)/i,
    /^(?:вот\s+(?:что|как)\s*\w*[!,:]?\s*)/i,
  ];
  for (const pattern of badStartPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Round 156: strip common closing fluff at end of response. Same anchor
  // logic as the opening patterns — only matches at end of string.
  // Round 175: added two more closings — "если хочешь — могу..." and
  // "буду рад помочь / готов помочь" closing tics.
  const badEndPatterns = [
    /\s*Если\s+(?:у\s+тебя\s+есть|появятся|возникнут)\s+(?:ещё\s+)?вопросы[^.!?]*[.!?]?\s*$/i,
    /\s*Удачи\s+(?:в\s+тренировках|с\s+тренировками)[^.!?]*[.!?]?\s*$/i,
    /\s*Надеюсь[,\s]+(?:это|информация|ответ)\s+(?:помог|поможет|полезн)[^.!?]*[.!?]?\s*$/i,
    /\s*Если\s+нужна\s+(?:дополнительная\s+)?помощь[^.!?]*[.!?]?\s*$/i,
    /\s*Если\s+хочешь[\s,]+(?:могу|расскажу|покажу|объясню)[^.!?]*[.!?]?\s*$/i,
    /\s*(?:Буду|Готов(?:ы)?)\s+(?:рад|помочь)[^.!?]*[.!?]?\s*$/i,
  ];
  for (const pattern of badEndPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.trim();

  // Round 190: Russian transliteration consistency. AI sometimes
  // emits English fitness abbreviations (PR, 1RM, 1PM, RPE, BMR,
  // TDEE) when our knowledge base / app UI consistently uses Cyrillic
  // versions (1ПМ, ИИ, БЖУ, etc.). Normalize so the user sees one
  // form everywhere — reduces cognitive load and the "what is 1PM?"
  // question. Uses word-boundary anchors to avoid breaking longer
  // tokens (e.g. "PR-предсказание" stays as is, "PR " → "ПР ").
  // Conservative substitutions only — leaves Latin acronyms in
  // proper nouns and brand names unchanged.
  cleaned = cleaned
    // 1RM / 1PM (one-rep max) — Russian uses 1ПМ
    .replace(/\b1\s?[RP]M\b/g, '1ПМ')
    // PR (personal record) → ПР, but only outside compound words
    .replace(/(^|[\s.,;:!?])PR(\s|[.,;:!?]|$)/g, '$1ПР$2')
    // PB (personal best) → ПР (rec consolidation)
    .replace(/(^|[\s.,;:!?])PB(\s|[.,;:!?]|$)/g, '$1ПР$2');

  // Round 190: profanity passthrough guard. Mood detection (line 1572)
  // catches user profanity to detect frustration mood — but the AI
  // sometimes ECHOES the profanity back in its response when keeping
  // tone. For an app users may show to family/coworkers, we strip
  // the most-egregious words. Keep the AI's emotional intent but
  // sanitize the form. Conservative list only — coarse swearing.
  //
  // Note: JavaScript \b doesn't work for Cyrillic, so we use explicit
  // non-letter boundary lookaround. The (^|[^а-яА-Я]) capture group
  // is preserved in the replacement.
  const profanityPatterns: Array<[RegExp, string]> = [
    [/(^|[^а-яА-Я])бл[яа](?:ть|дь)?(?=[^а-яА-Я]|$)/gi, '$1***'],
    [/(^|[^а-яА-Я])сук[аи](?=[^а-яА-Я]|$)/gi, '$1***'],
    [/(^|[^а-яА-Я])пизд[аеёы][цнк]?(?=[^а-яА-Я]|$)/gi, '$1***'],
    [/(^|[^а-яА-Я])хуй[нм]?[аеёиы]?(?=[^а-яА-Я]|$)/gi, '$1***'],
    [/(^|[^а-яА-Я])ебать(?=[^а-яА-Я]|$)/gi, '$1***'],
    [/(^|[^а-яА-Я])ёб(?:ан[ыоа]й|нут[ыоа]й)(?=[^а-яА-Я]|$)/gi, '$1***'],
  ];
  for (const [pattern, replacement] of profanityPatterns) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Обрезаем слишком длинные ответы (оставляем первые ~2000 слов + добавляем многоточие)
  const words = cleaned.split(/\s+/);
  if (words.length > 2000) {
    cleaned = words.slice(0, 2000).join(' ') + '...';
  }

  return cleaned.trim();
}

// ─── Vision (image analysis) ─────────────────────────────────────────────────

export async function analyzeImage(
  imageBase64: string,
  prompt: string,
  mimeType: string = 'image/jpeg',
): Promise<string> {
  const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL || DEFAULT_MODEL;
  // Audit: previously this re-labelled HEIC/HEIF mime types as
  // "image/jpeg" in the data URL prefix while leaving the raw bytes
  // untouched — Mistral's vision endpoint then saw a "JPEG" payload
  // that wouldn't decode and returned an opaque error. The route
  // schema now rejects HEIC up front so this normalisation is dead
  // code; pass mime type through verbatim and let any future surprise
  // surface as a clear 415 / 400 rather than a fake-decode failure.
  const safeMime = mimeType;
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${safeMime};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      stream: false,
      // Round 241: bumped from 2048 → 3072 to fit complex plate scans
      // (Russian holiday spreads commonly have 12-15 items: оливье, селёдка
      // под шубой, мимоза, винегрет, нарезка, рыба, мясо, гарниры, торт).
      // Each item averages ~120 tokens (name + 6 numeric fields + JSON
      // syntax + confidence). 2048 was tight at ~17 items; 3072 buys
      // headroom up to ~25. Cost per call rises ≤15% on complex shots
      // and is unchanged for typical 3-5 item meals (Mistral charges per
      // generated token, not per max_tokens budget).
      max_tokens: 3072,
      temperature: 0.2,
    }),
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(`${AI_BASE_URL}/chat/completions`, fetchOptions, REQUEST_TIMEOUT_MS);

      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : NaN;
        const delay = Math.max(RETRY_DELAY_MS, Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : RETRY_DELAY_MS * (attempt + 1));
        logger.warn(`AI vision ${response.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI vision error ${response.status}: ${errorText}`);
      }

      let data: { choices?: Array<{ message?: { content?: string } }> };
      try { data = (await response.json()) as typeof data; } catch (e) { throw new Error(`AI vision parse error: ${(e as Error).message}`); }
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      const isRetryable = (err as Error).name === 'AbortError' ||
        (err as Error).message?.includes('fetch') ||
        (err as Error).message?.includes('ECONNREFUSED') ||
        (err as Error).message?.includes('ETIMEDOUT');
      if (isRetryable && attempt < MAX_RETRIES) {
        logger.warn(`AI vision network error, retry ${attempt + 1}/${MAX_RETRIES}: ${(err as Error).message}`);
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error('AI vision: max retries exceeded');
}

// ─── Streaming chat (no tools) ───────────────────────────────────────────────

export async function* chatStream(
  options: Omit<ChatOptions, 'tools'>,
): AsyncGenerator<string> {
  const model = options.model || DEFAULT_MODEL;
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: options.system },
    ...options.messages,
  ];

  const response = await fetchWithTimeout(
    `${AI_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getApiKey()}` },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: options.maxTokens || 4096, temperature: options.temperature ?? 0.7 }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) throw new Error('AI stream response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
        } catch { /* skip malformed chunk */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Simple generation (no tools) ────────────────────────────────────────────

export async function generate(
  prompt: string,
  options?: { system?: string; model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  const result = await chat({
    system: options?.system || '',
    messages: [{ role: 'user', content: prompt }],
    model: options?.model,
    maxTokens: options?.maxTokens || 1024,
    temperature: options?.temperature ?? 0.7,
  });
  return result.content;
}

// ─── Health check ────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const response = await fetchWithTimeout(
      `${AI_BASE_URL}/models`,
      { headers: { 'Authorization': `Bearer ${getApiKey()}` } },
      10_000,
    );
    if (!response.ok) {
      return { ok: false, error: `AI API ответил ${response.status}` };
    }
    return { ok: true, model: DEFAULT_MODEL };
  } catch (e) {
    return {
      ok: false,
      error: 'Не удалось подключиться к AI API. Проверь AI_API_KEY в .env',
    };
  }
}
