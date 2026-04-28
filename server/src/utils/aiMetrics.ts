// In-memory AI usage metrics — reset daily at midnight, used for admin dashboard

interface HourBucket { hour: number; count: number }

// ── Counters ──────────────────────────────────────────────────────────────────
let requestsToday = 0;
let requestsThisWeek = 0;
let cacheHits = 0;
let cacheMisses = 0;
let totalTokensEstimate = 0;
let errorsToday = 0;
let lastResetDate = new Date().toDateString();
let weekResetMs = Date.now();

// ── Latency tracking ──────────────────────────────────────────────────────────
let latencySum = 0;       // ms total for non-cache requests
let latencyCount = 0;     // number of non-cache requests that measured latency
let latencyMin = Infinity;
let latencyMax = 0;

// Rolling window of the last N latency samples — used for percentile
// computation. 200 samples is enough for stable p95/p99 at <2k requests/day
// without burning memory; we sort on read which is fine for an admin page
// hit a few times an hour.
const LATENCY_WINDOW_SIZE = 200;
const latencyWindow: number[] = [];

/** Compute a percentile (0..100) on a copy of the rolling window. */
function computePercentile(p: number): number {
  if (latencyWindow.length === 0) return 0;
  const sorted = [...latencyWindow].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return Math.round(sorted[idx]);
}

// ── Hourly buckets (last 24h) ─────────────────────────────────────────────────
const hourlyBuckets: HourBucket[] = [];

// ── Provider detection (from env, checked once at startup) ────────────────────
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.mistral.ai/v1';
const AI_MODEL    = process.env.AI_MODEL    || 'mistral-small-latest';

function detectProvider(): { name: string; displayName: string } {
  if (AI_BASE_URL.includes('mistral.ai'))   return { name: 'mistral',  displayName: 'Mistral AI' };
  if (AI_BASE_URL.includes('deepseek.com')) return { name: 'deepseek', displayName: 'DeepSeek' };
  if (AI_BASE_URL.includes('openai.com'))   return { name: 'openai',   displayName: 'OpenAI' };
  if (AI_BASE_URL.includes('localhost') || AI_BASE_URL.includes('127.0.0.1') || AI_BASE_URL.includes('ollama'))
    return { name: 'ollama', displayName: 'Ollama (local)' };
  return { name: 'custom', displayName: AI_BASE_URL };
}

export const AI_PROVIDER = detectProvider();

// ── Reset helpers ─────────────────────────────────────────────────────────────
function resetIfNewDay(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    requestsToday = 0;
    cacheHits = 0;
    cacheMisses = 0;
    totalTokensEstimate = 0;
    errorsToday = 0;
    latencySum = 0;
    latencyCount = 0;
    latencyMin = Infinity;
    latencyMax = 0;
    latencyWindow.length = 0;
    lastResetDate = today;
  }
  // Reset weekly counter every 7 days
  if (Date.now() - weekResetMs > 7 * 24 * 60 * 60 * 1000) {
    requestsThisWeek = 0;
    weekResetMs = Date.now();
  }
}

function currentHour(): number {
  return new Date().getHours();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function recordAIRequest(opts: {
  cacheHit: boolean;
  tokensEstimate?: number;
  latencyMs?: number;
  error?: boolean;
}): void {
  resetIfNewDay();

  if (opts.error) {
    errorsToday++;
    return;
  }

  requestsToday++;
  requestsThisWeek++;

  if (opts.cacheHit) {
    cacheHits++;
  } else {
    cacheMisses++;
    totalTokensEstimate += opts.tokensEstimate ?? 500;

    if (opts.latencyMs !== undefined && opts.latencyMs > 0) {
      latencySum += opts.latencyMs;
      latencyCount++;
      if (opts.latencyMs < latencyMin) latencyMin = opts.latencyMs;
      if (opts.latencyMs > latencyMax) latencyMax = opts.latencyMs;
      // Maintain rolling window for percentile computation. Push new,
      // shift oldest when full — O(N) shift is fine at N=200 and called
      // only on non-cache requests.
      latencyWindow.push(opts.latencyMs);
      if (latencyWindow.length > LATENCY_WINDOW_SIZE) latencyWindow.shift();
    }
  }

  // Update hourly bucket
  const h = currentHour();
  const bucket = hourlyBuckets.find((b) => b.hour === h);
  if (bucket) {
    bucket.count++;
  } else {
    hourlyBuckets.push({ hour: h, count: 1 });
    if (hourlyBuckets.length > 24) hourlyBuckets.shift();
  }
}

export function getAIMetrics() {
  resetIfNewDay();
  const total = cacheHits + cacheMisses;
  return {
    requestsToday,
    requestsThisWeek,
    cacheHitRate: total > 0 ? Math.round((cacheHits / total) * 100) : 0,
    cacheHits,
    cacheMisses,
    totalTokensEstimate,
    errorsToday,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
    minLatencyMs: latencyCount > 0 ? latencyMin : 0,
    maxLatencyMs: latencyCount > 0 ? latencyMax : 0,
    // Percentiles from the last 200-request rolling window — better signal
    // for "is the model slow right now" than the day-wide avg, which gets
    // dragged around by a few outliers (Mistral cold-start spikes).
    p50LatencyMs: computePercentile(50),
    p95LatencyMs: computePercentile(95),
    p99LatencyMs: computePercentile(99),
    latencySampleSize: latencyWindow.length,
    hourlyBuckets: [...hourlyBuckets],
    provider: AI_PROVIDER.name,
    providerDisplayName: AI_PROVIDER.displayName,
    providerModel: AI_MODEL,
  };
}
