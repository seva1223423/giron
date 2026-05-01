/**
 * Round 196 — weight projection sanity helpers.
 *
 * Goal: prevent the AI from confidently quoting weight-loss/gain
 * projections that diverge sharply from the user's actual trend.
 * E.g. AI says "потеря ~0.5 кг/нед" when the user has been losing
 * 0 kg/week for 3 weeks — flag the discrepancy so the AI can
 * either avoid the claim or warn the user the trend has stalled.
 *
 * Pure functions (no DB) — caller fetches BodyWeight rows and
 * passes them in. Testable without mocking Prisma.
 */

export type WeightSample = { weightKg: number; date: string };

export type WeightTrend = {
  /** Number of samples used (post-filtering) */
  sampleCount: number;
  /** Span of dates covered (days) */
  daysSpan: number;
  /** Latest minus earliest weight, in kg */
  totalDeltaKg: number;
  /** Linear-fit slope in kg/week (positive = gaining) */
  weeklyDeltaKg: number;
  /** Bucket: 'gain' | 'loss' | 'stable' | 'insufficient_data' */
  trend: 'gain' | 'loss' | 'stable' | 'insufficient_data';
};

/**
 * Compute the user's actual weight trend from a list of weigh-ins.
 *
 *   - Requires ≥4 samples spanning ≥7 days; otherwise returns
 *     `insufficient_data` (no projection should be made).
 *   - Uses a simple least-squares fit on (date, weight) pairs to
 *     get a stable per-week slope, less noisy than (last-first)/days.
 *   - "Stable" bucket is delta within ±0.15 kg/week — below the
 *     noise floor of typical home scales (water + glycogen swings).
 */
export function computeWeightTrend(samples: WeightSample[]): WeightTrend {
  if (!samples || samples.length === 0) {
    return {
      sampleCount: 0,
      daysSpan: 0,
      totalDeltaKg: 0,
      weeklyDeltaKg: 0,
      trend: 'insufficient_data',
    };
  }

  // Sort by date ascending — caller may not have done so.
  const sorted = [...samples]
    .filter((s) => Number.isFinite(s.weightKg) && s.weightKg > 20 && s.weightKg < 400)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 4) {
    return {
      sampleCount: sorted.length,
      daysSpan: 0,
      totalDeltaKg: 0,
      weeklyDeltaKg: 0,
      trend: 'insufficient_data',
    };
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const firstTs = new Date(first.date + 'T00:00:00Z').getTime();
  const lastTs = new Date(last.date + 'T00:00:00Z').getTime();
  const daysSpan = Math.max(1, Math.round((lastTs - firstTs) / 86400000));

  if (daysSpan < 7) {
    return {
      sampleCount: sorted.length,
      daysSpan,
      totalDeltaKg: last.weightKg - first.weightKg,
      weeklyDeltaKg: 0,
      trend: 'insufficient_data',
    };
  }

  // Least-squares slope on (day_offset, weight)
  const n = sorted.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const s of sorted) {
    const x = (new Date(s.date + 'T00:00:00Z').getTime() - firstTs) / 86400000;
    const y = s.weightKg;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  // slope (kg/day) = (n*sumXY - sumX*sumY) / denom
  const slopePerDay = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const weeklyDeltaKg = slopePerDay * 7;
  const totalDeltaKg = last.weightKg - first.weightKg;

  let trend: WeightTrend['trend'];
  if (Math.abs(weeklyDeltaKg) < 0.15) {
    trend = 'stable';
  } else if (weeklyDeltaKg > 0) {
    trend = 'gain';
  } else {
    trend = 'loss';
  }

  return {
    sampleCount: n,
    daysSpan,
    totalDeltaKg: Math.round(totalDeltaKg * 10) / 10,
    weeklyDeltaKg: Math.round(weeklyDeltaKg * 100) / 100,
    trend,
  };
}

/**
 * Validate an AI-generated weight projection (e.g. "ты будешь терять
 * 0.5 кг в неделю") against the user's actual trend. Returns a flag
 * for the AI to surface the discrepancy if any.
 *
 * @param claimedWeeklyDelta — the AI's claimed kg/week (positive =
 *   gain, negative = loss). Pass NaN/undefined to skip validation.
 * @param trend — output of computeWeightTrend()
 *
 * Returns:
 *   { ok: true } — claim is consistent with reality (within 50%)
 *   { ok: false, reason } — divergence > 50% OR sign mismatch
 *   { ok: 'no_data' } — insufficient history to validate
 */
export function validateWeightClaim(
  claimedWeeklyDelta: number | undefined | null,
  trend: WeightTrend,
): { ok: true } | { ok: 'no_data' } | { ok: false; reason: string } {
  if (
    claimedWeeklyDelta == null ||
    !Number.isFinite(claimedWeeklyDelta)
  ) {
    return { ok: true }; // no claim to validate
  }

  if (trend.trend === 'insufficient_data') {
    return { ok: 'no_data' };
  }

  const actual = trend.weeklyDeltaKg;
  const claimed = claimedWeeklyDelta;

  // Sign mismatch: AI claims gain when user is losing (or vice versa)
  if (Math.sign(actual) !== 0 && Math.sign(claimed) !== 0 && Math.sign(actual) !== Math.sign(claimed)) {
    return {
      ok: false,
      reason: `AI говорит про ${claimed > 0 ? 'набор' : 'потерю'} ${Math.abs(claimed).toFixed(2)} кг/нед, но фактически у пользователя ${actual > 0 ? 'набор' : 'потеря'} ${Math.abs(actual).toFixed(2)} кг/нед — направление противоположное.`,
    };
  }

  // Magnitude divergence — > 50% off
  const absActual = Math.abs(actual);
  const absClaimed = Math.abs(claimed);
  const denom = Math.max(absActual, 0.1); // floor to avoid divide by zero
  const divergence = Math.abs(absClaimed - absActual) / denom;
  if (divergence > 0.5) {
    return {
      ok: false,
      reason: `AI прогноз ${claimed.toFixed(2)} кг/нед, факт ${actual.toFixed(2)} кг/нед — расхождение ${Math.round(divergence * 100)}%.`,
    };
  }

  return { ok: true };
}

/**
 * Format a trend block for inclusion in AI prompt context. Helps the
 * AI ground its weight statements in actual data instead of inventing
 * a plausible-sounding number.
 *
 * Returns "" if no trend (insufficient data).
 */
export function formatTrendForPrompt(trend: WeightTrend): string {
  if (trend.trend === 'insufficient_data') return '';
  const dir = trend.trend === 'gain' ? 'набор' : trend.trend === 'loss' ? 'потеря' : 'стабильно';
  return `## ФАКТИЧЕСКИЙ ТРЕНД ВЕСА (${trend.sampleCount} замеров за ${trend.daysSpan} дн)
${dir} ${Math.abs(trend.weeklyDeltaKg).toFixed(2)} кг/нед, всего ${trend.totalDeltaKg > 0 ? '+' : ''}${trend.totalDeltaKg} кг.
ВАЖНО: при упоминании прогнозов веса ссылайся на ЭТУ цифру, не выдумывай. Если хочешь дать другой прогноз — обоснуй (изменение калоража, новая программа).`;
}
