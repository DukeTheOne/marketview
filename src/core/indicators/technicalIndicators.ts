import { z } from 'zod';
import type { OHLCVCandle } from '../schemas/market';

export const IndicatorIdSchema = z.enum([
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

export interface ChartIndicatorsSummary {
  sma20: number | null;
  ema50: number | null;
  vwap: number | null;
  rsi14: number | null;
  bb20: { upper: number; middle: number; lower: number } | null;
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
    };
  }

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
  };
}
