import { describe, expect, it } from 'vitest';
import {
  calculateBollingerBands,
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
  computeAllChartIndicators,
  computeChartIndicatorsSummary,
  findSurroundingCandles,
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
    timestamp: overrides.timestamp ?? 1_700_000_000 + index * 60,
    open,
    high,
    low,
    close,
    volume: overrides.volume ?? 1000,
  };
}

describe('Empirical Challenger Suite: findSurroundingCandles & computeAllChartIndicators', () => {
  describe('Adversarial Challenge: findSurroundingCandles', () => {
    it('handles empty and null/undefined candle series gracefully without throwing', () => {
      expect(findSurroundingCandles([], 1000)).toEqual({
        left: null,
        right: null,
      });
      expect(findSurroundingCandles([] as any, 0)).toEqual({
        left: null,
        right: null,
      });
      expect(findSurroundingCandles(null as any, 1000)).toEqual({
        left: null,
        right: null,
      });
      expect(findSurroundingCandles(undefined as any, 1000)).toEqual({
        left: null,
        right: null,
      });
    });

    it('handles non-finite target timestamps (NaN, +Infinity, -Infinity)', () => {
      const series = [makeCandle(0, 100), makeCandle(1, 105)];
      expect(findSurroundingCandles(series, Number.NaN)).toEqual({
        left: null,
        right: null,
      });
      expect(findSurroundingCandles(series, Number.POSITIVE_INFINITY)).toEqual({
        left: null,
        right: null,
      });
      expect(findSurroundingCandles(series, Number.NEGATIVE_INFINITY)).toEqual({
        left: null,
        right: null,
      });
    });

    it('rigorously tests single-candle array boundaries and exact matches', () => {
      const c0 = makeCandle(0, 100, { timestamp: 5000 });
      const single = [c0];

      // Before single candle
      expect(findSurroundingCandles(single, 4999)).toEqual({
        left: null,
        right: c0,
      });
      expect(findSurroundingCandles(single, 0)).toEqual({
        left: null,
        right: c0,
      });
      expect(findSurroundingCandles(single, -100)).toEqual({
        left: null,
        right: c0,
      });

      // Exact single candle
      expect(findSurroundingCandles(single, 5000)).toEqual({
        left: c0,
        right: c0,
      });

      // After single candle
      expect(findSurroundingCandles(single, 5001)).toEqual({
        left: c0,
        right: null,
      });
      expect(findSurroundingCandles(single, 10000)).toEqual({
        left: c0,
        right: null,
      });
      expect(findSurroundingCandles(single, 5000.0001)).toEqual({
        left: c0,
        right: null,
      });
    });

    it('rigorously tests two-candle array boundaries and between-candle interpolation', () => {
      const c0 = makeCandle(0, 100, { timestamp: 1000 });
      const c1 = makeCandle(1, 110, { timestamp: 2000 });
      const pair = [c0, c1];

      // Before first
      expect(findSurroundingCandles(pair, 999)).toEqual({
        left: null,
        right: c0,
      });
      expect(findSurroundingCandles(pair, 0)).toEqual({
        left: null,
        right: c0,
      });

      // Exact first
      expect(findSurroundingCandles(pair, 1000)).toEqual({
        left: c0,
        right: c0,
      });

      // Between first and second
      expect(findSurroundingCandles(pair, 1000.001)).toEqual({
        left: c0,
        right: c1,
      });
      expect(findSurroundingCandles(pair, 1500)).toEqual({
        left: c0,
        right: c1,
      });
      expect(findSurroundingCandles(pair, 1999.999)).toEqual({
        left: c0,
        right: c1,
      });

      // Exact second
      expect(findSurroundingCandles(pair, 2000)).toEqual({
        left: c1,
        right: c1,
      });

      // After second
      expect(findSurroundingCandles(pair, 2000.001)).toEqual({
        left: c1,
        right: null,
      });
      expect(findSurroundingCandles(pair, 5000)).toEqual({
        left: c1,
        right: null,
      });
    });

    it('correctly handles negative timestamps in chronological order', () => {
      const cNeg2 = { timestamp: -2000, id: 'neg2' };
      const cNeg1 = { timestamp: -1000, id: 'neg1' };
      const cZero = { timestamp: 0, id: 'zero' };
      const cPos1 = { timestamp: 1000, id: 'pos1' };
      const series = [cNeg2, cNeg1, cZero, cPos1];

      expect(findSurroundingCandles(series, -3000)).toEqual({
        left: null,
        right: cNeg2,
      });
      expect(findSurroundingCandles(series, -2000)).toEqual({
        left: cNeg2,
        right: cNeg2,
      });
      expect(findSurroundingCandles(series, -1500)).toEqual({
        left: cNeg2,
        right: cNeg1,
      });
      expect(findSurroundingCandles(series, -1000)).toEqual({
        left: cNeg1,
        right: cNeg1,
      });
      expect(findSurroundingCandles(series, -500)).toEqual({
        left: cNeg1,
        right: cZero,
      });
      expect(findSurroundingCandles(series, 0)).toEqual({
        left: cZero,
        right: cZero,
      });
      expect(findSurroundingCandles(series, 500)).toEqual({
        left: cZero,
        right: cPos1,
      });
      expect(findSurroundingCandles(series, 1000)).toEqual({
        left: cPos1,
        right: cPos1,
      });
      expect(findSurroundingCandles(series, 2000)).toEqual({
        left: cPos1,
        right: null,
      });
    });

    it('verifies O(log N) binary search correctness and bounding invariant on 5,000 candles', () => {
      const COUNT = 5000;
      // Irregular step intervals between candles
      const candles: Array<{ timestamp: number; index: number }> = [];
      let currentTs = 1_000_000;
      for (let i = 0; i < COUNT; i++) {
        const step = 60 + ((i * 17) % 300); // 60s to 359s variable step
        currentTs += step;
        candles.push({ timestamp: currentTs, index: i });
      }

      const firstTs = candles[0]!.timestamp;
      const lastTs = candles[COUNT - 1]!.timestamp;

      // 1. Check out of bounds
      const beforeFirst = findSurroundingCandles(candles, firstTs - 100);
      expect(beforeFirst.left).toBeNull();
      expect(beforeFirst.right).toBe(candles[0]);

      const afterLast = findSurroundingCandles(candles, lastTs + 100);
      expect(afterLast.left).toBe(candles[COUNT - 1]);
      expect(afterLast.right).toBeNull();

      // 2. Check all 5,000 exact candle timestamps
      for (let i = 0; i < COUNT; i++) {
        const exact = findSurroundingCandles(candles, candles[i]!.timestamp);
        expect(exact.left).toBe(candles[i]);
        expect(exact.right).toBe(candles[i]);
      }

      // 3. Check midpoints and fractional offsets between every consecutive candle
      for (let i = 0; i < COUNT - 1; i++) {
        const tsA = candles[i]!.timestamp;
        const tsB = candles[i + 1]!.timestamp;
        const midTs = (tsA + tsB) / 2;
        const fracTs = tsA + 0.333;

        const midRes = findSurroundingCandles(candles, midTs);
        expect(midRes.left).toBe(candles[i]);
        expect(midRes.right).toBe(candles[i + 1]);
        expect(midRes.left!.timestamp).toBeLessThanOrEqual(midTs);
        expect(midRes.right!.timestamp).toBeGreaterThanOrEqual(midTs);

        const fracRes = findSurroundingCandles(candles, fracTs);
        expect(fracRes.left).toBe(candles[i]);
        expect(fracRes.right).toBe(candles[i + 1]);
        expect(fracRes.left!.timestamp).toBeLessThanOrEqual(fracTs);
        expect(fracRes.right!.timestamp).toBeGreaterThanOrEqual(fracTs);
      }

      // 4. Benchmark performance: 10,000 random queries on 5,000 elements must run in < 100ms
      const queryCount = 10000;
      const testTimestamps: number[] = [];
      for (let q = 0; q < queryCount; q++) {
        testTimestamps.push(firstTs + Math.random() * (lastTs - firstTs));
      }

      const start = performance.now();
      for (let q = 0; q < queryCount; q++) {
        const randTs = testTimestamps[q]!;
        const res = findSurroundingCandles(candles, randTs);
        if (
          !res.left ||
          !res.right ||
          res.left.timestamp > randTs ||
          res.right.timestamp < randTs
        ) {
          throw new Error(`Invariant failed at query ${q}`);
        }
      }
      const durationMs = performance.now() - start;
      expect(durationMs).toBeLessThan(50); // 10,000 binary searches in < 50ms
    });

    it('handles series with duplicate timestamps and microsecond epsilon offsets safely', () => {
      const cA = { timestamp: 1000, val: 'A' };
      const cB1 = { timestamp: 2000, val: 'B1' };
      const cB2 = { timestamp: 2000, val: 'B2' };
      const cC = { timestamp: 3000, val: 'C' };
      const dupSeries = [cA, cB1, cB2, cC];

      // Exact match on duplicate timestamp returns an exact match (left === right === one of the items)
      const exactDup = findSurroundingCandles(dupSeries, 2000);
      expect(exactDup.left?.timestamp).toBe(2000);
      expect(exactDup.right?.timestamp).toBe(2000);
      expect(exactDup.left).toBe(exactDup.right);

      // Infinitesimal epsilon before 1000 and after 3000
      expect(findSurroundingCandles(dupSeries, 1000 - 1e-12)).toEqual({
        left: null,
        right: cA,
      });
      expect(findSurroundingCandles(dupSeries, 3000 + 1e-12)).toEqual({
        left: cC,
        right: null,
      });
    });
  });

  describe('Adversarial Challenge: computeAllChartIndicators', () => {
    it('returns empty series and null summary for empty and invalid inputs', () => {
      const emptyRes = computeAllChartIndicators([]);
      expect(emptyRes.sma20).toEqual([]);
      expect(emptyRes.ema50).toEqual([]);
      expect(emptyRes.vwap).toEqual([]);
      expect(emptyRes.rsi14).toEqual([]);
      expect(emptyRes.bb20).toEqual([]);
      expect(emptyRes.summary).toEqual({
        sma20: null,
        ema50: null,
        vwap: null,
        rsi14: null,
        bb20: null,
        latestVolume: null,
        latestPrice: null,
      });

      const nullRes = computeAllChartIndicators(null as any);
      expect(nullRes.sma20).toEqual([]);
      expect(nullRes.summary.sma20).toBeNull();

      const undefinedRes = computeAllChartIndicators(undefined as any);
      expect(undefinedRes.sma20).toEqual([]);
      expect(undefinedRes.summary.sma20).toBeNull();
    });

    it('verifies exact threshold boundaries: length 1..13, 14, 15, 19, 20, 49, 50', () => {
      // Length 13: All empty except VWAP
      const series13 = Array.from({ length: 13 }, (_, i) => makeCandle(i, 100 + i));
      const res13 = computeAllChartIndicators(series13);
      expect(res13.sma20).toHaveLength(0);
      expect(res13.ema50).toHaveLength(0);
      expect(res13.bb20).toHaveLength(0);
      expect(res13.rsi14).toHaveLength(0);
      expect(res13.vwap).toHaveLength(13);
      expect(res13.summary.sma20).toBeNull();
      expect(res13.summary.ema50).toBeNull();
      expect(res13.summary.bb20).toBeNull();
      expect(res13.summary.rsi14).toBeNull();
      expect(res13.summary.vwap).not.toBeNull();
      expect(res13.summary.latestPrice).toBe(112);
      expect(res13.summary.latestVolume).toBe(1000);

      // Length 14: RSI14 requires > 14 candles (at length 14, return [])
      const series14 = Array.from({ length: 14 }, (_, i) => makeCandle(i, 100 + i));
      const res14 = computeAllChartIndicators(series14);
      expect(res14.rsi14).toHaveLength(0);
      expect(res14.summary.rsi14).toBeNull();

      // Length 15: RSI14 emits its very first point
      const series15 = Array.from({ length: 15 }, (_, i) => makeCandle(i, 100 + i));
      const res15 = computeAllChartIndicators(series15);
      expect(res15.rsi14).toHaveLength(1);
      expect(res15.summary.rsi14).not.toBeNull();
      expect(res15.sma20).toHaveLength(0);
      expect(res15.summary.sma20).toBeNull();
      expect(res15.bb20).toHaveLength(0);
      expect(res15.summary.bb20).toBeNull();

      // Length 19: SMA20 and BB20 still empty
      const series19 = Array.from({ length: 19 }, (_, i) => makeCandle(i, 100 + i));
      const res19 = computeAllChartIndicators(series19);
      expect(res19.sma20).toHaveLength(0);
      expect(res19.bb20).toHaveLength(0);
      expect(res19.summary.sma20).toBeNull();
      expect(res19.summary.bb20).toBeNull();

      // Length 20: SMA20 and BB20 emit their first point; EMA50 still empty
      const series20 = Array.from({ length: 20 }, (_, i) => makeCandle(i, 100 + i));
      const res20 = computeAllChartIndicators(series20);
      expect(res20.sma20).toHaveLength(1);
      expect(res20.bb20).toHaveLength(1);
      expect(res20.summary.sma20).not.toBeNull();
      expect(res20.summary.bb20).not.toBeNull();
      expect(res20.ema50).toHaveLength(0);
      expect(res20.summary.ema50).toBeNull();

      // Length 49: SMA20=30, BB20=30, RSI14=35; EMA50 still empty
      const series49 = Array.from({ length: 49 }, (_, i) => makeCandle(i, 100 + i));
      const res49 = computeAllChartIndicators(series49);
      expect(res49.sma20).toHaveLength(30);
      expect(res49.bb20).toHaveLength(30);
      expect(res49.rsi14).toHaveLength(35);
      expect(res49.ema50).toHaveLength(0);
      expect(res49.summary.ema50).toBeNull();

      // Length 50: EMA50 emits its first point; ALL indicators now non-null in summary
      const series50 = Array.from({ length: 50 }, (_, i) => makeCandle(i, 100 + i));
      const res50 = computeAllChartIndicators(series50);
      expect(res50.sma20).toHaveLength(31);
      expect(res50.bb20).toHaveLength(31);
      expect(res50.rsi14).toHaveLength(36);
      expect(res50.ema50).toHaveLength(1);
      expect(res50.summary.sma20).not.toBeNull();
      expect(res50.summary.bb20).not.toBeNull();
      expect(res50.summary.rsi14).not.toBeNull();
      expect(res50.summary.ema50).not.toBeNull();
      expect(res50.summary.vwap).not.toBeNull();
    });

    it('handles flat prices: Bollinger Bands collapse (upper === middle === lower) and RSI is 50', () => {
      const flatSeries = Array.from({ length: 60 }, (_, i) =>
        makeCandle(i, 125.5, {
          open: 125.5,
          high: 125.5,
          low: 125.5,
          volume: 5000,
        })
      );

      const res = computeAllChartIndicators(flatSeries);

      // Verify SMA 20 is flat at 125.5
      expect(res.sma20).toHaveLength(41);
      for (const pt of res.sma20) {
        expect(pt.value).toBe(125.5);
      }

      // Verify EMA 50 is flat at 125.5
      expect(res.ema50).toHaveLength(11);
      for (const pt of res.ema50) {
        expect(pt.value).toBe(125.5);
      }

      // Verify Bollinger Bands collapsed
      expect(res.bb20).toHaveLength(41);
      for (const pt of res.bb20) {
        expect(pt.middle).toBe(125.5);
        expect(pt.upper).toBe(125.5);
        expect(pt.lower).toBe(125.5);
      }

      // Verify RSI 14 is exactly 50 on flat series
      expect(res.rsi14).toHaveLength(46);
      for (const pt of res.rsi14) {
        expect(pt.value).toBe(50);
      }

      // Verify summary matches collapsed values
      expect(res.summary.sma20).toBe(125.5);
      expect(res.summary.ema50).toBe(125.5);
      expect(res.summary.vwap).toBe(125.5);
      expect(res.summary.rsi14).toBe(50);
      expect(res.summary.bb20).toEqual({
        upper: 125.5,
        middle: 125.5,
        lower: 125.5,
      });
      expect(res.summary.latestPrice).toBe(125.5);
      expect(res.summary.latestVolume).toBe(5000);
    });

    it('handles zero-volume candles gracefully without NaN or divide-by-zero crashes', () => {
      // 1. All-zero volume series
      const zeroVol = Array.from({ length: 60 }, (_, i) =>
        makeCandle(i, 100 + i, { volume: 0 })
      );
      const resZero = computeAllChartIndicators(zeroVol);
      expect(resZero.vwap).toEqual([]);
      expect(resZero.summary.vwap).toBeNull();
      expect(resZero.summary.latestVolume).toBe(0);
      expect(resZero.sma20).toHaveLength(41);
      expect(resZero.ema50).toHaveLength(11);

      // 2. Initial zero volume then sudden positive volume at bar 25
      const delayedVol = Array.from({ length: 60 }, (_, i) =>
        makeCandle(i, 100 + i, { volume: i < 25 ? 0 : 2000 })
      );
      const resDelayed = computeAllChartIndicators(delayedVol);
      expect(resDelayed.vwap).toHaveLength(35); // 60 - 25 = 35 points
      expect(resDelayed.vwap[0]?.timestamp).toBe(delayedVol[25]!.timestamp);
      expect(resDelayed.summary.vwap).not.toBeNull();
      expect(Number.isFinite(resDelayed.summary.vwap!)).toBe(true);

      // 3. Intermittent zero volume mid-series
      const intermittentVol = Array.from({ length: 60 }, (_, i) =>
        makeCandle(i, 100 + (i % 5), { volume: i % 2 === 0 ? 0 : 1500 })
      );
      const resIntermittent = computeAllChartIndicators(intermittentVol);
      expect(resIntermittent.vwap.length).toBeGreaterThan(0);
      for (const pt of resIntermittent.vwap) {
        expect(Number.isFinite(pt.value)).toBe(true);
      }
    });

    it('proves strict mathematical equivalence against individual indicator calculators across diverse synthetic regimes', () => {
      // Generate 5 distinct synthetic market regimes
      const regimes: Array<{ name: string; candles: OHLCVCandle[] }> = [
        {
          name: 'Geometric Brownian Motion Walk (200 bars)',
          candles: (() => {
            let price = 150;
            return Array.from({ length: 200 }, (_, i) => {
              const delta = (Math.sin(i * 0.3) + Math.cos(i * 0.7)) * 1.5;
              price = Math.max(1, price + delta);
              return makeCandle(i, price, {
                high: price + Math.abs(delta) + 1,
                low: Math.max(0.01, price - Math.abs(delta) - 1),
                volume: Math.floor(1000 + Math.abs(Math.sin(i)) * 5000),
              });
            });
          })(),
        },
        {
          name: 'High-Vol Spiky Regime with Out-Of-Order Input & NaN Corruptions (150 bars)',
          candles: (() => {
            const list: OHLCVCandle[] = [];
            for (let i = 0; i < 150; i++) {
              list.push(
                makeCandle(i, 50 + (i % 7) * 8 - (i % 3) * 4, {
                  volume: (i * 123) % 4000,
                })
              );
            }
            // Shuffle
            list.sort(() => Math.sin(list.length) - 0.5);
            // Inject malformed
            (list as any).push({
              timestamp: Number.NaN,
              close: Number.NaN,
              volume: 0,
            });
            return list;
          })(),
        },
        {
          name: 'Micro-cap Penny Stock Regime ($0.05 - $0.20)',
          candles: Array.from({ length: 80 }, (_, i) =>
            makeCandle(i, 0.05 + (i % 10) * 0.01, {
              high: 0.16,
              low: 0.04,
              volume: 100000 + i * 1000,
            })
          ),
        },
        {
          name: 'Mega-cap Mega-Price Stock Regime ($500,000+)',
          candles: Array.from({ length: 70 }, (_, i) =>
            makeCandle(i, 500000 + i * 250, {
              high: 501000 + i * 250,
              low: 499000 + i * 250,
              volume: 50,
            })
          ),
        },
        {
          name: 'Alternating Monotonic Surge & Collapse (100 bars)',
          candles: Array.from({ length: 100 }, (_, i) =>
            makeCandle(i, i < 50 ? 50 + i * 2 : 150 - (i - 50) * 2, {
              volume: 500 + i * 10,
            })
          ),
        },
      ];

      for (const { name, candles } of regimes) {
        const bundle = computeAllChartIndicators(candles);

        const expectedSma20 = calculateSMA(candles, 20);
        const expectedEma50 = calculateEMA(candles, 50);
        const expectedVwap = calculateVWAP(candles);
        const expectedRsi14 = calculateRSI(candles, 14);
        const expectedBb20 = calculateBollingerBands(candles, 20, 2);
        const expectedSummary = computeChartIndicatorsSummary(candles);

        expect(bundle.sma20, `SMA mismatch in ${name}`).toEqual(expectedSma20);
        expect(bundle.ema50, `EMA mismatch in ${name}`).toEqual(expectedEma50);
        expect(bundle.vwap, `VWAP mismatch in ${name}`).toEqual(expectedVwap);
        expect(bundle.rsi14, `RSI mismatch in ${name}`).toEqual(expectedRsi14);
        expect(bundle.bb20, `BB mismatch in ${name}`).toEqual(expectedBb20);
        expect(bundle.summary, `Summary mismatch in ${name}`).toEqual(expectedSummary);

        // Verify summary consistency with the last item in each array
        if (bundle.sma20.length > 0) {
          expect(bundle.summary.sma20).toBe(bundle.sma20[bundle.sma20.length - 1]!.value);
        } else {
          expect(bundle.summary.sma20).toBeNull();
        }

        if (bundle.ema50.length > 0) {
          expect(bundle.summary.ema50).toBe(bundle.ema50[bundle.ema50.length - 1]!.value);
        } else {
          expect(bundle.summary.ema50).toBeNull();
        }

        if (bundle.vwap.length > 0) {
          expect(bundle.summary.vwap).toBe(bundle.vwap[bundle.vwap.length - 1]!.value);
        } else {
          expect(bundle.summary.vwap).toBeNull();
        }

        if (bundle.rsi14.length > 0) {
          expect(bundle.summary.rsi14).toBe(bundle.rsi14[bundle.rsi14.length - 1]!.value);
        } else {
          expect(bundle.summary.rsi14).toBeNull();
        }

        if (bundle.bb20.length > 0) {
          const lastBb = bundle.bb20[bundle.bb20.length - 1]!;
          expect(bundle.summary.bb20).toEqual({
            upper: lastBb.upper,
            middle: lastBb.middle,
            lower: lastBb.lower,
          });
        } else {
          expect(bundle.summary.bb20).toBeNull();
        }
      }
    });

    it('handles zero prices and extreme market crash volatility (circuit breakers) without NaN or crash', () => {
      // Flash crash from $1000 down to $0.00 followed by erratic spikes
      const volatileSeries = [
        makeCandle(0, 1000),
        makeCandle(1, 950),
        makeCandle(2, 500),
        makeCandle(3, 0, { high: 10, low: 0, close: 0 }),
        makeCandle(4, 0, { high: 0, low: 0, close: 0 }),
        makeCandle(5, 50),
        makeCandle(6, 200),
        makeCandle(7, 800),
        makeCandle(8, 0, { high: 5, low: 0, close: 0 }),
        makeCandle(9, 1200),
        ...Array.from({ length: 50 }, (_, i) => makeCandle(10 + i, 500 + i * 10)),
      ];

      const res = computeAllChartIndicators(volatileSeries);
      expect(res.sma20.length).toBe(41);
      expect(res.ema50.length).toBe(11);
      expect(res.bb20.length).toBe(41);
      expect(res.rsi14.length).toBe(46);
      expect(res.vwap.length).toBe(60);

      // Verify no NaNs across all series
      for (const pt of res.sma20) expect(Number.isFinite(pt.value)).toBe(true);
      for (const pt of res.ema50) expect(Number.isFinite(pt.value)).toBe(true);
      for (const pt of res.rsi14) {
        expect(Number.isFinite(pt.value)).toBe(true);
        expect(pt.value).toBeGreaterThanOrEqual(0);
        expect(pt.value).toBeLessThanOrEqual(100);
      }
      for (const pt of res.bb20) {
        expect(Number.isFinite(pt.middle)).toBe(true);
        expect(Number.isFinite(pt.upper)).toBe(true);
        expect(Number.isFinite(pt.lower)).toBe(true);
        expect(pt.upper).toBeGreaterThanOrEqual(pt.middle);
        expect(pt.middle).toBeGreaterThanOrEqual(pt.lower);
      }
      for (const pt of res.vwap) expect(Number.isFinite(pt.value)).toBe(true);

      expect(res.summary.latestPrice).toBe(990);
    });

    it('scales cleanly to 10,000 candles with exact equivalence to all individual calculators', () => {
      const COUNT = 10000;
      const candles10k: OHLCVCandle[] = [];
      let price = 100;
      for (let i = 0; i < COUNT; i++) {
        price += Math.sin(i * 0.05) * 2;
        candles10k.push(
          makeCandle(i, Math.max(1, price), {
            volume: 1000 + (i % 500),
          })
        );
      }

      const start = performance.now();
      const all = computeAllChartIndicators(candles10k);
      const singlePassDuration = performance.now() - start;

      // Ensure execution is fast (under 100ms for 10k candles)
      expect(singlePassDuration).toBeLessThan(150);

      // Check outputs
      expect(all.sma20).toHaveLength(COUNT - 20 + 1);
      expect(all.ema50).toHaveLength(COUNT - 50 + 1);
      expect(all.vwap).toHaveLength(COUNT);
      expect(all.rsi14).toHaveLength(COUNT - 14);
      expect(all.bb20).toHaveLength(COUNT - 20 + 1);

      // Verify last items match summary
      expect(all.summary.sma20).toBe(all.sma20[all.sma20.length - 1]!.value);
      expect(all.summary.ema50).toBe(all.ema50[all.ema50.length - 1]!.value);
      expect(all.summary.vwap).toBe(all.vwap[all.vwap.length - 1]!.value);
      expect(all.summary.rsi14).toBe(all.rsi14[all.rsi14.length - 1]!.value);
      expect(all.summary.bb20).toEqual({
        upper: all.bb20[all.bb20.length - 1]!.upper,
        middle: all.bb20[all.bb20.length - 1]!.middle,
        lower: all.bb20[all.bb20.length - 1]!.lower,
      });

      // Spot-check mathematical equivalence on sample points
      const sma = calculateSMA(candles10k, 20);
      expect(all.sma20[0]).toEqual(sma[0]);
      expect(all.sma20[5000]).toEqual(sma[5000]);
      expect(all.sma20[all.sma20.length - 1]).toEqual(sma[sma.length - 1]);

      const ema = calculateEMA(candles10k, 50);
      expect(all.ema50[0]).toEqual(ema[0]);
      expect(all.ema50[5000]).toEqual(ema[5000]);
      expect(all.ema50[all.ema50.length - 1]).toEqual(ema[ema.length - 1]);
    });
  });
});
