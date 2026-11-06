import { describe, expect, it } from 'vitest';
import { DeterministicDemoProvider } from '../../providers/DeterministicDemoProvider';
import { createMarketStore } from '../../stores/marketStore';
import {
  IndicatorIdSchema,
  buildIntradayPricePoints,
  computeAutoCandlesLod,
  computeAutoIntradayLod,
  findNearestHoverPoint,
  getActiveChartStyle,
  normalizeExclusiveChartStyle,
  toggleExclusiveChartStyle,
  type IntradayPricePoint,
  type ProjectedHoverPoint,
} from '../technicalIndicators';
import type { OHLCVCandle } from '../../schemas/market';

describe('15-Minute Intraday Price Line Engine', () => {
  const mockDailyCandles: OHLCVCandle[] = [
    {
      timestamp: 1729728000, // 2024-10-24 00:00:00 UTC (day 20020)
      open: 150.0,
      high: 155.0,
      low: 148.0,
      close: 154.0, // Bullish
      volume: 1000000,
    },
    {
      timestamp: 1729814400, // 2024-10-25 00:00:00 UTC (day 20021)
      open: 154.0,
      high: 156.0,
      low: 147.0,
      close: 149.0, // Bearish
      volume: 1200000,
    },
  ];

  it('buildIntradayPricePoints maps K >= 2 fifteen-minute candles across [-0.42, +0.42] offsets', () => {
    // 5 intraday candles for day 20021 (timestamp 1729814400)
    const intradayForDay2: OHLCVCandle[] = [
      {
        timestamp: 1729814400 + 34200,
        open: 154.0,
        high: 155.0,
        low: 153.5,
        close: 154.5,
        volume: 200000,
      },
      {
        timestamp: 1729814400 + 35100,
        open: 154.5,
        high: 156.0,
        low: 154.0,
        close: 155.8,
        volume: 250000,
      },
      {
        timestamp: 1729814400 + 36000,
        open: 155.8,
        high: 155.8,
        low: 151.0,
        close: 152.0,
        volume: 250000,
      },
      {
        timestamp: 1729814400 + 36900,
        open: 152.0,
        high: 152.2,
        low: 147.0,
        close: 148.0,
        volume: 300000,
      },
      {
        timestamp: 1729814400 + 37800,
        open: 148.0,
        high: 149.5,
        low: 147.5,
        close: 149.0,
        volume: 200000,
      },
    ];

    const points = buildIntradayPricePoints(mockDailyCandles, intradayForDay2);
    // Day 1 has 4 fallback synthesized points; Day 2 has 5 actual intraday points = 9 total
    expect(points).toHaveLength(9);

    const day2Points = points.filter(
      (p) => p.dailyTimestamp === mockDailyCandles[1]!.timestamp
    );
    expect(day2Points).toHaveLength(5);

    // Verify offsets span from -0.42 to +0.42
    expect(day2Points[0]!.intraDayOffset).toBe(-0.42);
    expect(day2Points[4]!.intraDayOffset).toBe(0.42);
    expect(day2Points[2]!.intraDayOffset).toBe(0);

    // Verify prices match the 15-minute close prices
    expect(day2Points[0]!.price).toBe(154.5);
    expect(day2Points[1]!.price).toBe(155.8);
    expect(day2Points[2]!.price).toBe(152.0);
    expect(day2Points[3]!.price).toBe(148.0);
    expect(day2Points[4]!.price).toBe(149.0);
  });

  it('buildIntradayPricePoints falls back to 4-point intra-day OHLC path for days outside 15m window', () => {
    const points = buildIntradayPricePoints(mockDailyCandles, []);
    expect(points).toHaveLength(8);

    // Bullish day (close >= open: open -> low -> high -> close)
    const day1Points = points.slice(0, 4);
    expect(day1Points.map((p: IntradayPricePoint) => p.intraDayOffset)).toEqual([
      -0.42, -0.14, 0.14, 0.42,
    ]);
    expect(day1Points.map((p: IntradayPricePoint) => p.price)).toEqual([
      150.0, 148.0, 155.0, 154.0,
    ]);

    // Bearish day (close < open: open -> high -> low -> close)
    const day2Points = points.slice(4, 8);
    expect(day2Points.map((p: IntradayPricePoint) => p.intraDayOffset)).toEqual([
      -0.42, -0.14, 0.14, 0.42,
    ]);
    expect(day2Points.map((p: IntradayPricePoint) => p.price)).toEqual([
      154.0, 156.0, 147.0, 149.0,
    ]);
  });

  it('DeterministicDemoProvider.getCandles produces 15-minute bars whose daily open, high, low, close match corresponding 1D candles', async () => {
    const provider = new DeterministicDemoProvider();
    const dailyCandles = await provider.getCandles({
      ticker: 'AAPL',
      timeframe: '1D',
      limit: 10,
    });
    // Request 160 fifteen-minute bars (exactly 10 days * 16 bars)
    const intraday160 = await provider.getCandles({
      ticker: 'AAPL',
      timeframe: '15m',
      limit: 160,
    });

    expect(intraday160).toHaveLength(160);

    // Group 15-minute bars by UTC calendar day bucket
    const grouped = new Map<number, OHLCVCandle[]>();
    for (const bar of intraday160) {
      const bucket = Math.floor(bar.timestamp / 86400);
      const existing = grouped.get(bucket) ?? [];
      existing.push(bar);
      grouped.set(bucket, existing);
    }

    expect(grouped.size).toBe(10);

    for (const daily of dailyCandles) {
      const bucket = Math.floor(daily.timestamp / 86400);
      const bars = grouped.get(bucket);
      expect(bars).toBeDefined();
      if (!bars) continue;

      expect(bars).toHaveLength(16);

      const dayOpen = bars[0]!.open;
      const dayClose = bars[15]!.close;
      const dayHigh = Math.max(...bars.map((b) => b.high));
      const dayLow = Math.min(...bars.map((b) => b.low));

      expect(dayOpen).toBe(daily.open);
      expect(dayClose).toBe(daily.close);
      expect(dayHigh).toBe(daily.high);
      expect(dayLow).toBe(daily.low);
    }
  });

  it('marketStore refreshActiveCandles populates both candlesByKey and intradayCandlesByTicker', async () => {
    const provider = new DeterministicDemoProvider();
    const store = createMarketStore(provider, 'AAPL', '1D', 60);

    expect(store.getState().intradayCandlesByTicker['AAPL']).toBeUndefined();

    await store.getState().refreshActiveCandles();

    const state = store.getState();
    const dailyKey = 'AAPL:1D';
    expect(state.candlesByKey[dailyKey]).toBeDefined();
    expect(state.candlesByKey[dailyKey]!.length).toBeGreaterThan(0);

    expect(state.intradayCandlesByTicker['AAPL']).toBeDefined();
    expect(state.intradayCandlesByTicker['AAPL']!.length).toBeGreaterThan(0);
    expect(state.candlesByKey['AAPL:15m']).toBeDefined();
  });

  describe('Auto-Adaptive LOD (< 3M) & Hover Tracking Resolver', () => {
    const generateHistory = (barCount: number): OHLCVCandle[] => {
      const startEpoch = 1700000000;
      return Array.from({ length: barCount }, (_, i) => ({
        timestamp: startEpoch + i * 86400,
        open: 100 + i,
        high: 102 + i,
        low: 99 + i,
        close: 101 + i,
        volume: 10000,
      }));
    };

    it('computeAutoIntradayLod returns true for 1D, 1W, 1M and ranges spanning < 75 days & <= 58 bars', () => {
      const candles = generateHistory(120);

      // Default fallback when no logical range is available
      expect(computeAutoIntradayLod(candles, null, '1D')).toBe(true);
      expect(computeAutoIntradayLod(candles, null, '1W')).toBe(true);
      expect(computeAutoIntradayLod(candles, null, '1M')).toBe(true);

      // Range spanning 30 bars (30 days < 75 days and 30 bars <= 58 bars)
      expect(
        computeAutoIntradayLod(candles, { from: 70, to: 100 }, '3M')
      ).toBe(true);

      // Boundary: 50 bars (50 days < 75 days, <= 58 bars)
      expect(
        computeAutoIntradayLod(candles, { from: 50, to: 100 }, '1M')
      ).toBe(true);
    });

    it('computeAutoIntradayLod returns false for 3M, 6M, 1Y and ranges spanning >= 75 days or > 58 bars', () => {
      const candles = generateHistory(180);

      // Default fallback when no logical range is available
      expect(computeAutoIntradayLod(candles, null, '3M')).toBe(false);
      expect(computeAutoIntradayLod(candles, null, '6M')).toBe(false);
      expect(computeAutoIntradayLod(candles, null, '1Y')).toBe(false);

      // Range spanning 90 bars (90 days >= 75 days, 90 bars > 58 bars)
      expect(
        computeAutoIntradayLod(candles, { from: 50, to: 140 }, '1M')
      ).toBe(false);

      // Range spanning 60 bars (60 days < 75 days, but 60 bars > 58 bars)
      expect(
        computeAutoIntradayLod(candles, { from: 40, to: 100 }, '1D')
      ).toBe(false);
    });

    it('findNearestHoverPoint snaps to the closest point horizontally within max distance', () => {
      const testCandidates: ProjectedHoverPoint[] = [
        { x: 100, y: 150, price: 150.25, timestamp: 1000, source: 'price_15m' },
        { x: 200, y: 160, price: 155.5, timestamp: 2000, source: 'price_15m' },
        { x: 300, y: 145, price: 148.0, timestamp: 3000, source: 'daily_bar' },
      ];

      // Cursor at 108 is closest to point at x: 100 (distance 8 <= 120)
      const snap1 = findNearestHoverPoint(108, testCandidates, 120);
      expect(snap1).toEqual(testCandidates[0]);

      // Cursor at 190 is closest to point at x: 200 (distance 10 <= 120)
      const snap2 = findNearestHoverPoint(190, testCandidates, 120);
      expect(snap2).toEqual(testCandidates[1]);

      // Cursor at 310 is closest to point at x: 300 (distance 10 <= 120)
      const snap3 = findNearestHoverPoint(310, testCandidates, 120);
      expect(snap3).toEqual(testCandidates[2]);

      // Cursor too far (e.g., at 600, closest is 300, distance 300 > 120) -> returns null
      const snapNone = findNearestHoverPoint(600, testCandidates, 120);
      expect(snapNone).toBeNull();

      // Empty points or non-finite cursor
      expect(findNearestHoverPoint(100, [])).toBeNull();
      expect(findNearestHoverPoint(NaN, testCandidates)).toBeNull();
    });

    it('IndicatorIdSchema parses CANDLES successfully', () => {
      expect(IndicatorIdSchema.parse('CANDLES')).toBe('CANDLES');
    });

    it('computeAutoCandlesLod returns false for 1D, 1W and ranges spanning < 25 days and < 19 bars', () => {
      const candles = generateHistory(120);

      // Default fallback when no logical range is available
      expect(computeAutoCandlesLod(candles, null, '1D')).toBe(false);
      expect(computeAutoCandlesLod(candles, null, '1W')).toBe(false);

      // Range spanning 10 bars (10 days < 25 days and 10 bars < 19 bars)
      expect(
        computeAutoCandlesLod(candles, { from: 70, to: 80 }, '1M')
      ).toBe(false);

      // Boundary: 18 bars (18 days < 25 days, 18 bars < 19 bars)
      expect(
        computeAutoCandlesLod(candles, { from: 70, to: 88 }, '1D')
      ).toBe(false);
    });

    it('computeAutoCandlesLod returns true for 1M, 3M, 6M, 1Y and ranges spanning >= 25 days or >= 19 bars', () => {
      const candles = generateHistory(180);

      // Default fallback when no logical range is available
      expect(computeAutoCandlesLod(candles, null, '1M')).toBe(true);
      expect(computeAutoCandlesLod(candles, null, '3M')).toBe(true);
      expect(computeAutoCandlesLod(candles, null, '6M')).toBe(true);
      expect(computeAutoCandlesLod(candles, null, '1Y')).toBe(true);

      // Range spanning 25 bars (25 days >= 25 days, 25 bars >= 19 bars)
      expect(
        computeAutoCandlesLod(candles, { from: 50, to: 75 }, '1D')
      ).toBe(true);

      // Range spanning 20 bars (20 days < 25 days, but 20 bars >= 19 bars)
      expect(
        computeAutoCandlesLod(candles, { from: 50, to: 70 }, '1W')
      ).toBe(true);
    });
  });

  describe('Exclusive Primary Chart Style Helpers (CANDLES vs PRICE_15M)', () => {
    it('getActiveChartStyle determines active primary style, defaulting to CANDLES', () => {
      // Default to CANDLES when CANDLES is present
      expect(getActiveChartStyle(['CANDLES', 'VOLUME'])).toBe('CANDLES');

      // Returns PRICE_15M when PRICE_15M is present without CANDLES
      expect(getActiveChartStyle(['PRICE_15M', 'VOLUME'])).toBe('PRICE_15M');

      // Defaults to CANDLES when both are passed
      expect(getActiveChartStyle(['CANDLES', 'PRICE_15M', 'VOLUME'])).toBe('CANDLES');

      // Defaults to CANDLES when neither is passed
      expect(getActiveChartStyle(['VOLUME', 'SMA_20'])).toBe('CANDLES');
      expect(getActiveChartStyle([])).toBe('CANDLES');
    });

    it('normalizeExclusiveChartStyle ensures exactly one primary style is active while preserving others', () => {
      // Strips PRICE_15M when both are present and preserves others
      expect(
        normalizeExclusiveChartStyle(['CANDLES', 'VOLUME', 'PRICE_15M', 'SMA_20'])
      ).toEqual(['CANDLES', 'VOLUME', 'SMA_20']);

      // Keeps PRICE_15M when it is the sole primary style
      expect(
        normalizeExclusiveChartStyle(['PRICE_15M', 'VOLUME', 'SMA_20'])
      ).toEqual(['PRICE_15M', 'VOLUME', 'SMA_20']);

      // Injects CANDLES when neither is present
      expect(normalizeExclusiveChartStyle(['VOLUME'])).toEqual(['CANDLES', 'VOLUME']);
      expect(normalizeExclusiveChartStyle([])).toEqual(['CANDLES']);
    });

    it('toggleExclusiveChartStyle switches between CANDLES and PRICE_15M while preserving overlays', () => {
      // CANDLES -> PRICE_15M
      const toggled1 = toggleExclusiveChartStyle(['CANDLES', 'VOLUME', 'SMA_20']);
      expect(toggled1).toEqual(['PRICE_15M', 'VOLUME', 'SMA_20']);

      // PRICE_15M -> CANDLES
      const toggled2 = toggleExclusiveChartStyle(toggled1);
      expect(toggled2).toEqual(['CANDLES', 'VOLUME', 'SMA_20']);

      // Toggling from an array without either primary style starts with PRICE_15M (since default was CANDLES)
      const toggledFromNone = toggleExclusiveChartStyle(['VOLUME']);
      expect(toggledFromNone).toEqual(['PRICE_15M', 'VOLUME']);
    });
  });
});
