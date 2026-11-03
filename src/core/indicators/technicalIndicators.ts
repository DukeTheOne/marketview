import { z } from 'zod';
import {
  TIMEFRAME_FOCUS_DAYS,
  type OHLCVCandle,
  type Timeframe,
} from '../schemas/market';

export const IndicatorIdSchema = z.enum([
  'CANDLES',
  'PRICE_15M',
  'SMA_20',
  'EMA_50',
  'BB_20',
  'VWAP',
  'RSI_14',
  'VOLUME',
]);
export type IndicatorId = z.infer<typeof IndicatorIdSchema>;

export const IndicatorPointSchema = z.object({
  timestamp: z.number().int().positive(),
  value: z.number().finite(),
});
export type IndicatorPoint = z.infer<typeof IndicatorPointSchema>;

export const BollingerPointSchema = z.object({
  timestamp: z.number().int().positive(),
  middle: z.number().finite(),
  upper: z.number().finite(),
  lower: z.number().finite(),
});
export type BollingerPoint = z.infer<typeof BollingerPointSchema>;

export const IntradayPricePointSchema = z.object({
  /** Unix timestamp (seconds UTC) of the parent daily candle on the chart timeScale */
  dailyTimestamp: z.number().int().positive(),
  /** Unix timestamp (seconds UTC) of the 15-minute bar (or synthesized daily sub-step) */
  timestamp: z.number().int().positive(),
  /** Normalized horizontal offset within the parent daily bar column in [-0.5, 0.5] */
  intraDayOffset: z.number().finite().min(-0.5).max(0.5),
  /** Actual price value at this 15-minute step */
  price: z.number().finite().nonnegative(),
});
export type IntradayPricePoint = z.infer<typeof IntradayPricePointSchema>;

export interface ChartIndicatorsSummary {
  sma20: number | null;
  ema50: number | null;
  vwap: number | null;
  rsi14: number | null;
  bb20: { upper: number; middle: number; lower: number } | null;
  latestVolume?: number | null;
  latestPrice?: number | null;
}

/**
 * Formats a raw share/contract volume number into a compact human-readable string (e.g. "48.2M", "850K").
 */
export function formatCompactVolume(volume: number | null | undefined): string | null {
  if (volume === null || volume === undefined || !Number.isFinite(volume) || volume < 0) {
    return null;
  }
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(1)}K`;
  }
  return `${Math.round(volume)}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortAndValidateCandles(candles: OHLCVCandle[]): OHLCVCandle[] {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }
  const filtered = candles.filter(
    (c) => c && Number.isFinite(c.timestamp) && Number.isFinite(c.close)
  );
  return [...filtered].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Calculates Simple Moving Average (SMA) over closing prices.
 */
export function calculateSMA(
  candles: OHLCVCandle[],
  period: number
): IndicatorPoint[] {
  if (
    !Array.isArray(candles) ||
    !Number.isInteger(period) ||
    period <= 0 ||
    candles.length < period
  ) {
    return [];
  }

  const sorted = sortAndValidateCandles(candles);
  if (sorted.length < period) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  let windowSum = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (!current) {
      continue;
    }
    windowSum += current.close;

    if (i >= period) {
      const exiting = sorted[i - period];
      if (exiting) {
        windowSum -= exiting.close;
      }
    }

    if (i >= period - 1) {
      points.push(
        IndicatorPointSchema.parse({
          timestamp: current.timestamp,
          value: round2(windowSum / period),
        })
      );
    }
  }

  return points;
}

/**
 * Calculates Exponential Moving Average (EMA) over closing prices,
 * seeded with the Simple Moving Average of the first `period` bars.
 */
export function calculateEMA(
  candles: OHLCVCandle[],
  period: number
): IndicatorPoint[] {
  if (
    !Array.isArray(candles) ||
    !Number.isInteger(period) ||
    period <= 0 ||
    candles.length < period
  ) {
    return [];
  }

  const sorted = sortAndValidateCandles(candles);
  if (sorted.length < period) {
    return [];
  }

  let seedSum = 0;
  for (let i = 0; i < period; i++) {
    const candle = sorted[i];
    if (candle) {
      seedSum += candle.close;
    }
  }

  const seedCandle = sorted[period - 1];
  if (!seedCandle) {
    return [];
  }

  let ema = seedSum / period;
  const multiplier = 2 / (period + 1);
  const points: IndicatorPoint[] = [
    IndicatorPointSchema.parse({
      timestamp: seedCandle.timestamp,
      value: round2(ema),
    }),
  ];

  for (let i = period; i < sorted.length; i++) {
    const candle = sorted[i];
    if (!candle) {
      continue;
    }
    ema = (candle.close - ema) * multiplier + ema;
    points.push(
      IndicatorPointSchema.parse({
        timestamp: candle.timestamp,
        value: round2(ema),
      })
    );
  }

  return points;
}

/**
 * Calculates Bollinger Bands (middle SMA, upper band, lower band).
 */
export function calculateBollingerBands(
  candles: OHLCVCandle[],
  period = 20,
  stdDevMultiplier = 2
): BollingerPoint[] {
  if (
    !Array.isArray(candles) ||
    !Number.isInteger(period) ||
    period <= 0 ||
    stdDevMultiplier < 0 ||
    candles.length < period
  ) {
    return [];
  }

  const sorted = sortAndValidateCandles(candles);
  if (sorted.length < period) {
    return [];
  }

  const points: BollingerPoint[] = [];

  for (let i = period - 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (!current) {
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const item = sorted[j];
      if (item) {
        sum += item.close;
      }
    }
    const mean = sum / period;

    let squaredDiffSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const item = sorted[j];
      if (item) {
        const diff = item.close - mean;
        squaredDiffSum += diff * diff;
      }
    }

    const stdDev = Math.sqrt(squaredDiffSum / period);
    const middle = round2(mean);
    const upper = round2(mean + stdDevMultiplier * stdDev);
    const lower = round2(mean - stdDevMultiplier * stdDev);

    points.push(
      BollingerPointSchema.parse({
        timestamp: current.timestamp,
        middle,
        upper,
        lower,
      })
    );
  }

  return points;
}

/**
 * Calculates cumulative Volume-Weighted Average Price (VWAP):
 * cumulative (((high + low + close) / 3) * volume) / cumulative volume.
 * Skips bars until cumulative volume is positive.
 */
export function calculateVWAP(candles: OHLCVCandle[]): IndicatorPoint[] {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  const sorted = sortAndValidateCandles(candles);
  const points: IndicatorPoint[] = [];

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const candle of sorted) {
    if (candle.volume > 0) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
    }

    if (cumulativeVolume > 0) {
      points.push(
        IndicatorPointSchema.parse({
          timestamp: candle.timestamp,
          value: round2(cumulativeTPV / cumulativeVolume),
        })
      );
    }
  }

  return points;
}

function computeRsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) {
    return 50;
  }
  if (avgLoss === 0) {
    return 100;
  }
  if (avgGain === 0) {
    return 0;
  }
  const rs = avgGain / avgLoss;
  const raw = 100 - 100 / (1 + rs);
  return round2(Math.min(100, Math.max(0, raw)));
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's smoothing method,
 * clamped to [0, 100].
 */
export function calculateRSI(
  candles: OHLCVCandle[],
  period = 14
): IndicatorPoint[] {
  if (
    !Array.isArray(candles) ||
    !Number.isInteger(period) ||
    period <= 0 ||
    candles.length <= period
  ) {
    return [];
  }

  const sorted = sortAndValidateCandles(candles);
  if (sorted.length <= period) {
    return [];
  }

  let initialGainSum = 0;
  let initialLossSum = 0;

  for (let i = 1; i <= period; i++) {
    const curr = sorted[i];
    const prev = sorted[i - 1];
    if (!curr || !prev) {
      continue;
    }
    const delta = curr.close - prev.close;
    if (delta > 0) {
      initialGainSum += delta;
    } else if (delta < 0) {
      initialLossSum += -delta;
    }
  }

  let avgGain = initialGainSum / period;
  let avgLoss = initialLossSum / period;

  const firstRsiCandle = sorted[period];
  if (!firstRsiCandle) {
    return [];
  }

  const points: IndicatorPoint[] = [
    IndicatorPointSchema.parse({
      timestamp: firstRsiCandle.timestamp,
      value: computeRsiFromAverages(avgGain, avgLoss),
    }),
  ];

  for (let i = period + 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = sorted[i - 1];
    if (!curr || !prev) {
      continue;
    }
    const delta = curr.close - prev.close;
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    points.push(
      IndicatorPointSchema.parse({
        timestamp: curr.timestamp,
        value: computeRsiFromAverages(avgGain, avgLoss),
      })
    );
  }

  return points;
}

/**
 * Computes the latest bar's indicator summary across standard chart indicators.
 */
export function computeChartIndicatorsSummary(
  candles: OHLCVCandle[]
): ChartIndicatorsSummary {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      sma20: null,
      ema50: null,
      vwap: null,
      rsi14: null,
      bb20: null,
      latestVolume: null,
      latestPrice: null,
    };
  }

  const sorted = sortAndValidateCandles(candles);
  const latestCandle = sorted[sorted.length - 1];
  const sma20Points = calculateSMA(candles, 20);
  const ema50Points = calculateEMA(candles, 50);
  const vwapPoints = calculateVWAP(candles);
  const rsi14Points = calculateRSI(candles, 14);
  const bb20Points = calculateBollingerBands(candles, 20, 2);

  const lastSma20 = sma20Points[sma20Points.length - 1];
  const lastEma50 = ema50Points[ema50Points.length - 1];
  const lastVwap = vwapPoints[vwapPoints.length - 1];
  const lastRsi14 = rsi14Points[rsi14Points.length - 1];
  const lastBb20 = bb20Points[bb20Points.length - 1];

  return {
    sma20: lastSma20 ? lastSma20.value : null,
    ema50: lastEma50 ? lastEma50.value : null,
    vwap: lastVwap ? lastVwap.value : null,
    rsi14: lastRsi14 ? lastRsi14.value : null,
    bb20: lastBb20
      ? {
          upper: lastBb20.upper,
          middle: lastBb20.middle,
          lower: lastBb20.lower,
        }
      : null,
    latestVolume:
      latestCandle && Number.isFinite(latestCandle.volume)
        ? latestCandle.volume
        : null,
    latestPrice:
      latestCandle && Number.isFinite(latestCandle.close)
        ? round2(latestCandle.close)
        : null,
  };
}

/**
 * Synthesizes sub-bar intraday price coordinates across the chart's daily bars.
 * For dates with actual 15-minute intraday candles, maps them across [-0.42, +0.42] offset.
 * For historical dates outside the 15-minute window, synthesizes a 4-point OHLC path
 * so the price line remains unbroken and continuous across the entire chart history.
 */
export function buildIntradayPricePoints(
  dailyCandles: OHLCVCandle[],
  intradayCandles: OHLCVCandle[] = []
): IntradayPricePoint[] {
  if (!Array.isArray(dailyCandles) || dailyCandles.length === 0) {
    return [];
  }

  const sortedDaily = sortAndValidateCandles(dailyCandles);
  if (sortedDaily.length === 0) {
    return [];
  }

  const sortedIntraday = sortAndValidateCandles(intradayCandles);
  const intradayByDayBucket = new Map<number, OHLCVCandle[]>();

  for (const candle of sortedIntraday) {
    const bucket = Math.floor(candle.timestamp / 86400);
    const existing = intradayByDayBucket.get(bucket);
    if (existing) {
      existing.push(candle);
    } else {
      intradayByDayBucket.set(bucket, [candle]);
    }
  }

  const points: IntradayPricePoint[] = [];

  for (const d of sortedDaily) {
    const dayBucket = Math.floor(d.timestamp / 86400);
    const dayIntraday = intradayByDayBucket.get(dayBucket);

    if (dayIntraday && dayIntraday.length >= 2) {
      const K = dayIntraday.length;
      for (let k = 0; k < K; k++) {
        const intra = dayIntraday[k]!;
        const rawOffset = ((k / (K - 1)) - 0.5) * 0.84;
        const intraDayOffset = Math.round(rawOffset * 10000) / 10000;
        points.push(
          IntradayPricePointSchema.parse({
            dailyTimestamp: d.timestamp,
            timestamp: intra.timestamp,
            intraDayOffset,
            price: round2(intra.close),
          })
        );
      }
    } else if (dayIntraday && dayIntraday.length === 1) {
      const intra = dayIntraday[0]!;
      points.push(
        IntradayPricePointSchema.parse({
          dailyTimestamp: d.timestamp,
          timestamp: intra.timestamp,
          intraDayOffset: 0,
          price: round2(intra.close),
        })
      );
    } else {
      // Fallback 4-point intra-day OHLC path across [-0.42, -0.14, +0.14, +0.42]
      const offsets = [-0.42, -0.14, 0.14, 0.42];
      const prices =
        d.close >= d.open
          ? [d.open, d.low, d.high, d.close]
          : [d.open, d.high, d.low, d.close];

      for (let idx = 0; idx < 4; idx++) {
        points.push(
          IntradayPricePointSchema.parse({
            dailyTimestamp: d.timestamp,
            timestamp: d.timestamp,
            intraDayOffset: offsets[idx]!,
            price: round2(prices[idx]!),
          })
        );
      }
    }
  }

  return points;
}

/**
 * Thresholds defining a "< 3 months" viewport span.
 * 3M is 90 calendar days (~63 trading days). Using 75 calendar days / 58 logical bars
 * cleanly separates 1D/1W/1M (<= 30 calendar days, <= 30 bars) and zoomed-in viewports
 * from 3M/6M/1Y (>= 88 calendar days, >= 60 bars) even when 90d boundaries fall on weekends.
 */
export const INTRADAY_LOD_MAX_CALENDAR_DAYS = 75;
export const INTRADAY_LOD_MAX_LOGICAL_BARS = 58;

/**
 * Pure helper that evaluates whether the current chart viewport spans < 3 months
 * and should auto-enable the 15-minute intraday price line.
 */
export function computeAutoIntradayLod(
  sortedCandles: ReadonlyArray<{ timestamp: number }>,
  visibleLogicalRange: { from: number; to: number } | null | undefined,
  fallbackTimeframe: Timeframe
): boolean {
  if (
    !visibleLogicalRange ||
    sortedCandles.length < 2 ||
    !Number.isFinite(visibleLogicalRange.from) ||
    !Number.isFinite(visibleLogicalRange.to)
  ) {
    return TIMEFRAME_FOCUS_DAYS[fallbackTimeframe] < 90;
  }

  const logicalSpan = visibleLogicalRange.to - visibleLogicalRange.from;
  const startIndex = Math.max(
    0,
    Math.min(sortedCandles.length - 1, Math.floor(visibleLogicalRange.from))
  );
  const endIndex = Math.max(
    startIndex,
    Math.min(sortedCandles.length - 1, Math.ceil(visibleLogicalRange.to))
  );
  const startTs = sortedCandles[startIndex]?.timestamp ?? 0;
  const endTs = sortedCandles[endIndex]?.timestamp ?? startTs;
  const calendarDays = (endTs - startTs) / 86400;

  return (
    calendarDays < INTRADAY_LOD_MAX_CALENDAR_DAYS &&
    logicalSpan <= INTRADAY_LOD_MAX_LOGICAL_BARS
  );
}

/**
 * Thresholds defining a ">= 1 month" viewport span where daily OHLC candlesticks
 * ("mean bars") should automatically be displayed.
 * Below 1 month (e.g. 1D = 5d, 1W = 10d, or zoomed in < 25 calendar days / <= 18 bars),
 * daily candlesticks are auto-hidden so the 15-minute price line is unobstructed.
 */
export const CANDLES_LOD_MIN_CALENDAR_DAYS = 25;
export const CANDLES_LOD_MIN_LOGICAL_BARS = 19;

/**
 * Pure helper that evaluates whether the current chart viewport spans >= 1 month
 * and should auto-enable the daily OHLC candlestick bars ('CANDLES').
 *
 * - For timeframe presets when no live `visibleLogicalRange` is provided:
 *   '15m', '1h', '1D', '1W' -> false (< 1M)
 *   '1M', '3M', '6M', '1Y'  -> true  (>= 1M)
 * - When a live `visibleLogicalRange` ({ from, to }) is available:
 *   returns `true` iff `calendarDays >= CANDLES_LOD_MIN_CALENDAR_DAYS || logicalSpan >= CANDLES_LOD_MIN_LOGICAL_BARS`.
 */
export function computeAutoCandlesLod(
  sortedCandles: ReadonlyArray<{ timestamp: number }>,
  visibleLogicalRange: { from: number; to: number } | null | undefined,
  fallbackTimeframe: Timeframe
): boolean {
  if (
    !visibleLogicalRange ||
    sortedCandles.length < 2 ||
    !Number.isFinite(visibleLogicalRange.from) ||
    !Number.isFinite(visibleLogicalRange.to)
  ) {
    return TIMEFRAME_FOCUS_DAYS[fallbackTimeframe] >= 30;
  }

  const logicalSpan = visibleLogicalRange.to - visibleLogicalRange.from;
  const startIndex = Math.max(
    0,
    Math.min(sortedCandles.length - 1, Math.floor(visibleLogicalRange.from))
  );
  const endIndex = Math.max(
    startIndex,
    Math.min(sortedCandles.length - 1, Math.ceil(visibleLogicalRange.to))
  );
  const startTs = sortedCandles[startIndex]?.timestamp ?? 0;
  const endTs = sortedCandles[endIndex]?.timestamp ?? startTs;
  const calendarDays = (endTs - startTs) / 86400;

  return (
    calendarDays >= CANDLES_LOD_MIN_CALENDAR_DAYS ||
    logicalSpan >= CANDLES_LOD_MIN_LOGICAL_BARS
  );
}

export interface ProjectedHoverPoint {
  x: number;
  y: number;
  price: number;
  timestamp: number;
  source: 'price_15m' | 'daily_bar';
}

/**
 * Finds the projected hover point closest horizontally to `cursorX`.
 * Returns `null` if `points` is empty, `cursorX` is not finite, or the closest point
 * exceeds `maxSnapDistancePx`.
 */
export function findNearestHoverPoint(
  cursorX: number,
  points: ReadonlyArray<ProjectedHoverPoint>,
  maxSnapDistancePx = 120
): ProjectedHoverPoint | null {
  if (!Number.isFinite(cursorX) || points.length === 0) {
    return null;
  }

  let bestPoint: ProjectedHoverPoint | null = null;
  let minDistance = Infinity;

  for (const pt of points) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      continue;
    }
    const dist = Math.abs(pt.x - cursorX);
    if (dist < minDistance) {
      minDistance = dist;
      bestPoint = pt;
    }
  }

  if (bestPoint !== null && minDistance <= maxSnapDistancePx) {
    return bestPoint;
  }

  return null;
}
