// In-memory AI usage metrics — reset daily, used for admin dashboard

interface HourBucket { hour: number; count: number }

let requestsToday = 0;
let cacheHits = 0;
let cacheMisses = 0;
let totalTokensEstimate = 0;
let lastResetDate = new Date().toDateString();

// Last 24 hourly buckets
const hourlyBuckets: HourBucket[] = [];

function resetIfNewDay(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    requestsToday = 0;
    cacheHits = 0;
    cacheMisses = 0;
    totalTokensEstimate = 0;
    lastResetDate = today;
  }
}

function currentHour(): number {
  return new Date().getHours();
}

export function recordAIRequest(opts: { cacheHit: boolean; tokensEstimate?: number }): void {
  resetIfNewDay();
  requestsToday++;
  if (opts.cacheHit) {
    cacheHits++;
  } else {
    cacheMisses++;
    totalTokensEstimate += opts.tokensEstimate ?? 500;
  }

  // Update hourly bucket
  const h = currentHour();
  const bucket = hourlyBuckets.find((b) => b.hour === h);
  if (bucket) {
    bucket.count++;
  } else {
    hourlyBuckets.push({ hour: h, count: 1 });
    // Keep only last 24 entries
    if (hourlyBuckets.length > 24) hourlyBuckets.shift();
  }
}

export function getAIMetrics() {
  resetIfNewDay();
  const total = cacheHits + cacheMisses;
  return {
    requestsToday,
    cacheHitRate: total > 0 ? Math.round((cacheHits / total) * 100) : 0,
    cacheHits,
    cacheMisses,
    totalTokensEstimate,
    hourlyBuckets: [...hourlyBuckets],
  };
}
