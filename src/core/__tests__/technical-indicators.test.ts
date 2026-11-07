import { describe, expect, it } from 'vitest';
import {
  BollingerPointSchema,
  IndicatorIdSchema,
  IndicatorPointSchema,
  calculateBollingerBands,
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
  computeAllChartIndicators,
  computeChartIndicatorsSummary,
  findSurroundingCandles,
  formatCompactVolume,
} from '../indicators/technicalIndicators';
import type { OHLCVCandle } from '../schemas/market';

function makeCandle(
  index: number,
  close: number,
  overrides: Partial<OHLCVCandle> = {}
): OHLCVCandle {
  const high = overrides.high ?? Math.max(close + 2, close);
  const low = overrides.low ?? Math.max(0.01, close - 2);
  const open = overrides.open ?? close;
  return {
    timestamp: overrides.timestamp ?? 1_700_000_000 + index * 3600,
    open,
    high,
    low,
    close,
    volume: overrides.volume ?? 1000,
  };
}

describe('Technical Indicators Headless Engine', () => {
  describe('Zod Schemas', () => {
    it('validates IndicatorIdSchema and point schemas', () => {
      expect(IndicatorIdSchema.parse('PRICE_15M')).toBe('PRICE_15M');
      expect(IndicatorIdSchema.parse('SMA_20')).toBe('SMA_20');
      expect(IndicatorIdSchema.parse('EMA_50')).toBe('EMA_50');
      expect(IndicatorIdSchema.parse('BB_20')).toBe('BB_20');
      expect(IndicatorIdSchema.parse('VWAP')).toBe('VWAP');
      expect(IndicatorIdSchema.parse('RSI_14')).toBe('RSI_14');
      expect(IndicatorIdSchema.parse('VOLUME')).toBe('VOLUME');
      expect(() => IndicatorIdSchema.parse('MACD')).toThrow();

      expect(
        IndicatorPointSchema.parse({ timestamp: 1700000000, value: 150.25 })
      ).toEqual({
        timestamp: 1700000000,
        value: 150.25,
      });

      expect(
        BollingerPointSchema.parse({
          timestamp: 1700000000,
          middle: 100,
          upper: 104,
          lower: 96,
        })
      ).toEqual({
        timestamp: 1700000000,
        middle: 100,
        upper: 104,
        lower: 96,
      });
    });
  });

  describe('calculateSMA', () => {
    it('returns empty array when candles are fewer than period or period is invalid', () => {
      const candles = [makeCandle(0, 100), makeCandle(1, 110)];
      expect(calculateSMA([], 5)).toEqual([]);
      expect(calculateSMA(candles, 3)).toEqual([]);
      expect(calculateSMA(candles, 0)).toEqual([]);
      expect(calculateSMA(candles, -2)).toEqual([]);
    });

    it('sorts unsorted candles chronologically and computes exact sliding window averages rounded to 2 decimals', () => {
      const c0 = makeCandle(0, 10);
      const c1 = makeCandle(1, 20);
      const c2 = makeCandle(2, 30);
      const c3 = makeCandle(3, 43);

      // Provide out-of-order input
      const result = calculateSMA([c2, c0, c3, c1], 3);
      expect(result).toEqual([
        { timestamp: c2.timestamp, value: 20 }, // (10 + 20 + 30) / 3 = 20
        { timestamp: c3.timestamp, value: 31 }, // (20 + 30 + 43) / 3 = 31
      ]);

      // Filtering non-finite or corrupted candles without redundant full-array Zod parse
      const malformed = {
        timestamp: Number.NaN,
        open: 0,
        high: 0,
        low: 0,
        close: Number.NaN,
        volume: 0,
      } as unknown as OHLCVCandle;
      const resultWithMalformed = calculateSMA([c2, malformed, c0, c3, c1], 3);
      expect(resultWithMalformed).toEqual(result);
    });
  });

  describe('calculateEMA', () => {
    it('returns empty array when candles are fewer than period or period is invalid', () => {
      const candles = [makeCandle(0, 100), makeCandle(1, 105)];
      expect(calculateEMA([], 3)).toEqual([]);
      expect(calculateEMA(candles, 3)).toEqual([]);
      expect(calculateEMA(candles, 0)).toEqual([]);
    });

    it('seeds with SMA of first period bars and applies exponential smoothing', () => {
      const c0 = makeCandle(0, 10);
      const c1 = makeCandle(1, 20);
      const c2 = makeCandle(2, 30);
      const c3 = makeCandle(3, 40);
      const c4 = makeCandle(4, 50);

      // Period 3 -> multiplier = 2 / (3 + 1) = 0.5
      // Seed at c2 = (10 + 20 + 30) / 3 = 20
      // EMA at c3 = (40 - 20) * 0.5 + 20 = 30
      // EMA at c4 = (50 - 30) * 0.5 + 30 = 40
      const result = calculateEMA([c3, c1, c4, c0, c2], 3);
      expect(result).toEqual([
        { timestamp: c2.timestamp, value: 20 },
        { timestamp: c3.timestamp, value: 30 },
        { timestamp: c4.timestamp, value: 40 },
      ]);
    });
  });

  describe('calculateBollingerBands', () => {
    it('returns empty array when insufficient candles or invalid args', () => {
      const candles = [makeCandle(0, 100), makeCandle(1, 100)];
      expect(calculateBollingerBands([], 20)).toEqual([]);
      expect(calculateBollingerBands(candles, 5)).toEqual([]);
      expect(calculateBollingerBands(candles, 0)).toEqual([]);
      expect(calculateBollingerBands(candles, 2, -1)).toEqual([]);
    });

    it('returns Collapsed bands (upper === middle === lower) for flat prices', () => {
      const candles = [
        makeCandle(0, 150),
        makeCandle(1, 150),
        makeCandle(2, 150),
        makeCandle(3, 150),
      ];
      const result = calculateBollingerBands(candles, 3, 2);
      expect(result).toEqual([
        { timestamp: candles[2]!.timestamp, middle: 150, upper: 150, lower: 150 },
        { timestamp: candles[3]!.timestamp, middle: 150, upper: 150, lower: 150 },
      ]);
    });

    it('computes accurate middle, upper, and lower bands with standard deviation multiplier', () => {
      // Closes: [10, 20, 30] -> mean = 20, variance = ((100 + 0 + 100)/3) = 66.6667, stdDev = 8.1649658
      // Upper (2x) = 20 + 16.3299 = 36.33, Lower (2x) = 20 - 16.3299 = 3.67
      const candles = [makeCandle(0, 10), makeCandle(1, 20), makeCandle(2, 30)];
      const result = calculateBollingerBands(candles, 3, 2);
      expect(result).toEqual([
        {
          timestamp: candles[2]!.timestamp,
          middle: 20,
          upper: 36.33,
          lower: 3.67,
        },
      ]);
    });
  });

  describe('calculateVWAP', () => {
    it('returns empty array for empty input or all-zero volume candles', () => {
      expect(calculateVWAP([])).toEqual([]);
      const zeroVolCandles = [
        makeCandle(0, 100, { volume: 0 }),
        makeCandle(1, 110, { volume: 0 }),
      ];
      expect(calculateVWAP(zeroVolCandles)).toEqual([]);
    });

    it('calculates cumulative typical price weighted by volume and handles mid-series zero volume gracefully', () => {
      // Bar 0: H=103, L=97, C=100 -> TP = 100, Vol = 0 (skipped until cumulativeVol > 0)
      // Bar 1: H=103, L=97, C=100 -> TP = 100, Vol = 100 -> VWAP = 100
      // Bar 2: H=113, L=107, C=110 -> TP = 110, Vol = 300 -> CumTPV = 10000 + 33000 = 43000, CumVol = 400 -> VWAP = 107.5
      // Bar 3: H=120, L=110, C=115 -> TP = 115, Vol = 0 -> CumTPV = 43000, CumVol = 400 -> VWAP remains 107.5
      const c0 = makeCandle(0, 100, { high: 103, low: 97, volume: 0 });
      const c1 = makeCandle(1, 100, { high: 103, low: 97, volume: 100 });
      const c2 = makeCandle(2, 110, { high: 113, low: 107, volume: 300 });
      const c3 = makeCandle(3, 115, { high: 120, low: 110, volume: 0 });

      const result = calculateVWAP([c2, c0, c3, c1]);
      expect(result).toEqual([
        { timestamp: c1.timestamp, value: 100 },
        { timestamp: c2.timestamp, value: 107.5 },
        { timestamp: c3.timestamp, value: 107.5 },
      ]);
    });
  });

  describe('calculateRSI', () => {
    it('returns empty array when candles length is <= period', () => {
      const candles = Array.from({ length: 14 }, (_, i) =>
        makeCandle(i, 100 + i)
      );
      expect(calculateRSI([], 14)).toEqual([]);
      expect(calculateRSI(candles, 14)).toEqual([]);
      expect(calculateRSI(candles, 0)).toEqual([]);
    });

    it('returns 100 on pure uptrend, 0 on pure downtrend, and 50 on flat prices', () => {
      const uptrend = Array.from({ length: 6 }, (_, i) =>
        makeCandle(i, 100 + i * 5)
      );
      const downtrend = Array.from({ length: 6 }, (_, i) =>
        makeCandle(i, 100 - i * 5)
      );
      const flat = Array.from({ length: 6 }, (_, i) => makeCandle(i, 100));

      const upRsi = calculateRSI(uptrend, 4);
      expect(upRsi).toHaveLength(2);
      expect(upRsi[0]?.value).toBe(100);
      expect(upRsi[1]?.value).toBe(100);

      const downRsi = calculateRSI(downtrend, 4);
      expect(downRsi).toHaveLength(2);
      expect(downRsi[0]?.value).toBe(0);
      expect(downRsi[1]?.value).toBe(0);

      const flatRsi = calculateRSI(flat, 4);
      expect(flatRsi).toHaveLength(2);
      expect(flatRsi[0]?.value).toBe(50);
      expect(flatRsi[1]?.value).toBe(50);
    });

    it('applies Wilder smoothing accurately across mixed gains and losses within [0, 100]', () => {
      const closes = [
        44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
        45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
      ];
      const candles = closes.map((c, idx) => makeCandle(idx, c));
      const rsiPoints = calculateRSI(candles, 14);

      expect(rsiPoints).toHaveLength(closes.length - 14);
      for (const pt of rsiPoints) {
        expect(pt.value).toBeGreaterThanOrEqual(0);
        expect(pt.value).toBeLessThanOrEqual(100);
      }
      // Standard Wilder RSI on this classic dataset is ~70.46 on bar 14
      expect(rsiPoints[0]?.value).toBeCloseTo(70.46, 1);
    });
  });

  describe('computeChartIndicatorsSummary & formatCompactVolume', () => {
    it('returns all nulls for empty candle array', () => {
      expect(computeChartIndicatorsSummary([])).toEqual({
        sma20: null,
        ema50: null,
        vwap: null,
        rsi14: null,
        bb20: null,
        latestVolume: null,
        latestPrice: null,
      });
    });

    it('formats volume numbers into compact K/M/B strings', () => {
      expect(formatCompactVolume(null)).toBeNull();
      expect(formatCompactVolume(undefined)).toBeNull();
      expect(formatCompactVolume(-5)).toBeNull();
      expect(formatCompactVolume(450)).toBe('450');
      expect(formatCompactVolume(45_600)).toBe('45.6K');
      expect(formatCompactVolume(48_250_000)).toBe('48.25M');
      expect(formatCompactVolume(2_500_000_000)).toBe('2.50B');
    });

    it('returns partial nulls when bar count is between 20 and 49, and full summary at 60+ bars', () => {
      const candles25 = Array.from({ length: 25 }, (_, i) =>
        makeCandle(i, 100 + i)
      );
      const partial = computeChartIndicatorsSummary(candles25);
      expect(partial.sma20).not.toBeNull();
      expect(partial.ema50).toBeNull();
      expect(partial.vwap).not.toBeNull();
      expect(partial.rsi14).not.toBeNull();
      expect(partial.bb20).not.toBeNull();
      expect(partial.latestVolume).toBe(1000);
      expect(partial.latestPrice).toBe(124);

      const candles60 = Array.from({ length: 60 }, (_, i) =>
        makeCandle(i, 100 + i * 0.5)
      );
      const full = computeChartIndicatorsSummary(candles60);
      expect(full.sma20).not.toBeNull();
      expect(full.ema50).not.toBeNull();
      expect(full.vwap).not.toBeNull();
      expect(full.rsi14).toBe(100);
      expect(full.bb20).not.toBeNull();
      expect(full.bb20!.upper).toBeGreaterThan(full.bb20!.middle);
      expect(full.bb20!.lower).toBeLessThan(full.bb20!.middle);
      expect(full.latestVolume).toBe(1000);
      expect(full.latestPrice).toBe(129.5);
    });
  });

  describe('findSurroundingCandles', () => {
    it('returns nulls for empty array or non-finite timestamp', () => {
      expect(findSurroundingCandles([], 100)).toEqual({
        left: null,
        right: null,
      });
      expect(findSurroundingCandles([makeCandle(0, 100)], Number.NaN)).toEqual({
        left: null,
        right: null,
      });
      expect(
        findSurroundingCandles([makeCandle(0, 100)], Number.POSITIVE_INFINITY)
      ).toEqual({
        left: null,
        right: null,
      });
    });

    it('handles target timestamps before first candle and after last candle', () => {
      const c0 = makeCandle(0, 100, { timestamp: 1000 });
      const c1 = makeCandle(1, 105, { timestamp: 2000 });
      const c2 = makeCandle(2, 110, { timestamp: 3000 });
      const sorted = [c0, c1, c2];

      // Before first candle: left is null, right is first candle
      expect(findSurroundingCandles(sorted, 500)).toEqual({
        left: null,
        right: c0,
      });

      // After last candle: left is last candle, right is null
      expect(findSurroundingCandles(sorted, 3500)).toEqual({
        left: c2,
        right: null,
      });
    });

    it('handles exact matches returning the matched candle on both left and right', () => {
      const c0 = makeCandle(0, 100, { timestamp: 1000 });
      const c1 = makeCandle(1, 105, { timestamp: 2000 });
      const c2 = makeCandle(2, 110, { timestamp: 3000 });
      const sorted = [c0, c1, c2];

      expect(findSurroundingCandles(sorted, 1000)).toEqual({
        left: c0,
        right: c0,
      });
      expect(findSurroundingCandles(sorted, 2000)).toEqual({
        left: c1,
        right: c1,
      });
      expect(findSurroundingCandles(sorted, 3000)).toEqual({
        left: c2,
        right: c2,
      });
    });

    it('handles timestamps strictly between candles in O(log N) binary search', () => {
      const candles = Array.from({ length: 100 }, (_, i) =>
        makeCandle(i, 100 + i, { timestamp: 1000 + i * 100 })
      );

      // Between candle 42 (timestamp 5200) and candle 43 (timestamp 5300)
      const target = 5245;
      const result = findSurroundingCandles(candles, target);
      expect(result.left).toBe(candles[42]);
      expect(result.right).toBe(candles[43]);
      expect(result.left?.timestamp).toBe(5200);
      expect(result.right?.timestamp).toBe(5300);
    });

    it('works on generic objects with timestamp property', () => {
      const items = [
        { timestamp: 10, label: 'A' },
        { timestamp: 20, label: 'B' },
        { timestamp: 30, label: 'C' },
      ];
      expect(findSurroundingCandles(items, 15)).toEqual({
        left: items[0],
        right: items[1],
      });
      expect(findSurroundingCandles(items, 5)).toEqual({
        left: null,
        right: items[0],
      });
      expect(findSurroundingCandles(items, 35)).toEqual({
        left: items[2],
        right: null,
      });
      expect(findSurroundingCandles(items, 20)).toEqual({
        left: items[1],
        right: items[1],
      });
    });

    it('handles single-candle arrays correctly', () => {
      const single = [makeCandle(0, 100, { timestamp: 1500 })];
      expect(findSurroundingCandles(single, 1000)).toEqual({
        left: null,
        right: single[0],
      });
      expect(findSurroundingCandles(single, 1500)).toEqual({
        left: single[0],
        right: single[0],
      });
      expect(findSurroundingCandles(single, 2000)).toEqual({
        left: single[0],
        right: null,
      });
    });
  });

  describe('computeAllChartIndicators', () => {
    it('returns empty series and null summary for empty array without throwing', () => {
      const res = computeAllChartIndicators([]);
      expect(res.sma20).toEqual([]);
      expect(res.ema50).toEqual([]);
      expect(res.vwap).toEqual([]);
      expect(res.rsi14).toEqual([]);
      expect(res.bb20).toEqual([]);
      expect(res.summary).toEqual({
        sma20: null,
        ema50: null,
        vwap: null,
        rsi14: null,
        bb20: null,
        latestVolume: null,
        latestPrice: null,
      });
    });

    it('returns empty series for fewer than required candles without throwing', () => {
      const candles5 = Array.from({ length: 5 }, (_, i) =>
        makeCandle(i, 100 + i)
      );
      const res = computeAllChartIndicators(candles5);
      expect(res.sma20).toEqual([]);
      expect(res.ema50).toEqual([]);
      expect(res.vwap).toHaveLength(5); // VWAP is computed whenever volume > 0
      expect(res.rsi14).toEqual([]);
      expect(res.bb20).toEqual([]);
      expect(res.summary.sma20).toBeNull();
      expect(res.summary.ema50).toBeNull();
      expect(res.summary.vwap).not.toBeNull();
      expect(res.summary.latestPrice).toBe(104);
      expect(res.summary.latestVolume).toBe(1000);
    });

    it('computes all series and summary matching individual functions on full 60+ candle series', () => {
      const candles60 = Array.from({ length: 60 }, (_, i) =>
        makeCandle(i, 100 + Math.sin(i / 5) * 10, {
          volume: 1000 + i * 50,
        })
      );

      const all = computeAllChartIndicators(candles60);
      const expectedSma20 = calculateSMA(candles60, 20);
      const expectedEma50 = calculateEMA(candles60, 50);
      const expectedVwap = calculateVWAP(candles60);
      const expectedRsi14 = calculateRSI(candles60, 14);
      const expectedBb20 = calculateBollingerBands(candles60, 20, 2);
      const expectedSummary = computeChartIndicatorsSummary(candles60);

      expect(all.sma20).toEqual(expectedSma20);
      expect(all.ema50).toEqual(expectedEma50);
      expect(all.vwap).toEqual(expectedVwap);
      expect(all.rsi14).toEqual(expectedRsi14);
      expect(all.bb20).toEqual(expectedBb20);
      expect(all.summary).toEqual(expectedSummary);
    });

    it('sorts unsorted input candles and excludes malformed non-finite candles', () => {
      const c0 = makeCandle(0, 100, { timestamp: 1000 });
      const c1 = makeCandle(1, 105, { timestamp: 2000 });
      const c2 = makeCandle(2, 110, { timestamp: 3000 });
      const malformed = {
        timestamp: Number.NaN,
        open: 0,
        high: 0,
        low: 0,
        close: Number.NaN,
        volume: 0,
      } as unknown as OHLCVCandle;

      // Pass out of order and with malformed candle
      const res = computeAllChartIndicators([c2, malformed, c0, c1]);
      expect(res.vwap).toHaveLength(3);
      expect(res.vwap[0]?.timestamp).toBe(1000);
      expect(res.vwap[1]?.timestamp).toBe(2000);
      expect(res.vwap[2]?.timestamp).toBe(3000);
      expect(res.summary.latestPrice).toBe(110);
    });
  });
});
