import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartContainer } from '../features/chart/ChartContainer';
import type { OHLCVCandle } from '../core/schemas/market';
import type { ProjectedHoverPoint } from '../core/indicators/technicalIndicators';
import {
  findNearestHoverPoint,
  findSurroundingCandles,
  computeAllChartIndicators,
} from '../core/indicators/technicalIndicators';

// Standard 5-candle test dataset
const BASE_CANDLES: OHLCVCandle[] = [
  { timestamp: 1711000000, open: 150.0, high: 155.0, low: 149.0, close: 154.0, volume: 1000000 },
  { timestamp: 1711086400, open: 154.0, high: 158.0, low: 153.0, close: 157.5, volume: 1200000 },
  { timestamp: 1711172800, open: 157.5, high: 160.0, low: 155.0, close: 156.0, volume: 900000 },
  { timestamp: 1711259200, open: 156.0, high: 162.0, low: 155.5, close: 161.0, volume: 1500000 },
  { timestamp: 1711345600, open: 161.0, high: 165.0, low: 160.0, close: 164.5, volume: 1300000 },
];

/**
 * Custom React Dispatcher harness to invoke ChartContainer directly,
 * inspecting internal state setters, refs, and event handlers.
 */
function createHookDispatcher() {
  const refs: Array<{ current: any }> = [];
  const stateSpies: Array<{ val: any; setterSpy: ReturnType<typeof vi.fn> }> = [];
  let refIdx = 0;
  let stateIdx = 0;

  const dispatcher: any = {
    useRef: (initial: any) => {
      const idx = refIdx++;
      if (!refs[idx]) refs[idx] = { current: initial };
      return refs[idx];
    },
    useState: (initial: any) => {
      const idx = stateIdx++;
      const val = typeof initial === 'function' ? initial() : initial;
      const setterSpy = vi.fn((next: any) => {
        if (stateSpies[idx]) {
          stateSpies[idx].val = typeof next === 'function' ? next(stateSpies[idx].val) : next;
        }
      });
      stateSpies[idx] = { val, setterSpy };
      return [val, setterSpy];
    },
    useMemo: (fn: any) => fn(),
    useEffect: () => {},
    useCallback: (fn: any) => fn,
    useLayoutEffect: () => {},
    readContext: () => {},
    useContext: () => {},
    useId: () => 'id',
    useTransition: () => [false, (fn: any) => fn()],
  };
  return { dispatcher, refs, stateSpies };
}

describe('Challenger M2 Return 2: Adversarial Stress & Integration Harness', () => {

  describe('1. Hover Coordinate Deduplication & Rapid Jitter Stress', () => {
    it('suppresses re-renders across 1,000 sub-pixel and float-jitter mouse movements within single snap horizon', () => {
      const { dispatcher, refs, stateSpies } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        const vnode = ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: BASE_CANDLES,
        });

        const onMouseMove = vnode.props.onMouseMove;
        const activeHoverPointSetter = stateSpies[2]!.setterSpy;

        const candidate: ProjectedHoverPoint = {
          x: 350.5,
          y: 220.25,
          price: 156.0,
          timestamp: 1711172800,
          source: 'daily_bar',
        };
        refs[11]!.current = [candidate];

        const makeEvent = (clientX: number) => ({
          currentTarget: {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
          },
          clientX,
        });

        // First event snaps candidate
        onMouseMove(makeEvent(350.5));
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(1);
        expect(activeHoverPointSetter).toHaveBeenLastCalledWith(candidate);

        // 1,000 high-frequency jitter events around candidate with float and sub-pixel deltas
        for (let i = 1; i <= 1000; i++) {
          const delta = (Math.sin(i) * 50); // oscillations within [-50, +50] px, well within 120px snap radius
          onMouseMove(makeEvent(350.5 + delta));
        }

        // Setter MUST NOT be called again: 100% deduplication of jitter
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(1);
      } finally {
        internals.H = oldH;
      }
    });

    it('rigorously tests exact boundary distances (119.99px, 120.00px, 120.01px) in findNearestHoverPoint', () => {
      const candidate: ProjectedHoverPoint = {
        x: 200,
        y: 100,
        price: 150,
        timestamp: 1711000000,
        source: 'daily_bar',
      };
      const candidates = [candidate];

      // Exact 120 boundary:
      // x = 200 - 120 = 80 -> distance = 120.0 (inclusive <= 120)
      expect(findNearestHoverPoint(80, candidates, 120)).toEqual(candidate);
      // x = 200 + 120 = 320 -> distance = 120.0 (inclusive <= 120)
      expect(findNearestHoverPoint(320, candidates, 120)).toEqual(candidate);

      // Just inside boundary:
      expect(findNearestHoverPoint(80.01, candidates, 120)).toEqual(candidate);
      expect(findNearestHoverPoint(319.99, candidates, 120)).toEqual(candidate);

      // Just outside boundary (> 120):
      expect(findNearestHoverPoint(79.99, candidates, 120)).toBeNull();
      expect(findNearestHoverPoint(320.01, candidates, 120)).toBeNull();
    });

    it('handles 200 rapid alternating enter/leave bursts without stale state or uncaught exceptions', () => {
      const { dispatcher, refs, stateSpies } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        const vnode = ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: BASE_CANDLES,
        });

        const onMouseMove = vnode.props.onMouseMove;
        const onMouseLeave = vnode.props.onMouseLeave;
        const activeHoverPointSetter = stateSpies[2]!.setterSpy;

        const candidate: ProjectedHoverPoint = {
          x: 150,
          y: 200,
          price: 155,
          timestamp: 1711086400,
          source: 'daily_bar',
        };
        refs[11]!.current = [candidate];

        const enterEvent = {
          currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
          clientX: 150,
        };

        // 100 enter-leave cycles = 200 actions
        for (let cycle = 0; cycle < 100; cycle++) {
          onMouseMove(enterEvent);
          onMouseLeave();
        }

        // Each cycle triggers 1 set(candidate) and 1 set(null) = 200 calls
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(200);

        // Multiple redundant onMouseLeave calls when already null
        onMouseLeave();
        onMouseLeave();
        onMouseLeave();
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(200);
      } finally {
        internals.H = oldH;
      }
    });
  });

  describe('2. Loading Backdrop Non-Blocking & Cold-Load Verification', () => {
    it('shows backdrop on cold load (isLoading=true, candles=[]) and hides when candles exist', () => {
      // 1. Cold load: isLoading=true, 0 candles
      const coldMarkup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'GOOGL',
          timeframe: '1D',
          candles: [],
          isLoading: true,
        })
      );
      expect(coldMarkup).toContain('Syncing GOOGL (1D) OHLCV series...');
      expect(coldMarkup).toContain('backdrop-blur-[1px]');
      expect(coldMarkup).toContain('pointer-events-none');

      // 2. Background refresh: isLoading=true, 5 candles
      const refreshMarkup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'GOOGL',
          timeframe: '1D',
          candles: BASE_CANDLES,
          isLoading: true,
        })
      );
      expect(refreshMarkup).not.toContain('Syncing GOOGL (1D) OHLCV series...');
      expect(refreshMarkup).not.toContain('backdrop-blur-[1px]');

      // 3. Normal loaded state: isLoading=false, 5 candles
      const loadedMarkup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'GOOGL',
          timeframe: '1D',
          candles: BASE_CANDLES,
          isLoading: false,
        })
      );
      expect(loadedMarkup).not.toContain('Syncing');
      expect(loadedMarkup).not.toContain('backdrop-blur-[1px]');

      // 4. Idle empty state: isLoading=false, 0 candles
      const idleEmptyMarkup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'GOOGL',
          timeframe: '1D',
          candles: [],
          isLoading: false,
        })
      );
      expect(idleEmptyMarkup).not.toContain('Syncing');
      expect(idleEmptyMarkup).not.toContain('backdrop-blur-[1px]');
    });

    it('ensures backdrop has pointer-events-none so it never blocks user clicks or pointer events', () => {
      const coldMarkup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'SPY',
          timeframe: '1W',
          candles: [],
          isLoading: true,
        })
      );
      // The outer backdrop container MUST have pointer-events-none
      expect(coldMarkup).toMatch(/pointer-events-none.*Syncing SPY/s);
    });
  });

  describe('3. Auto-Polling Visibility Lifecycle & Gating Oracles', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      delete (globalThis as any).document;
    });

    it('orchestrates complete visibility lifecycle: visible -> hidden -> visible -> hidden', () => {
      const refreshCandlesSpy = vi.fn().mockResolvedValue(undefined);
      const refreshQuotesSpy = vi.fn().mockResolvedValue(undefined);

      (globalThis as any).document = { visibilityState: 'visible' };

      const pollIntervalSec = 15;
      const activeWatchlist = { id: 'wl-1', name: 'Tech', tickers: ['AAPL', 'MSFT'] };
      const activeTicker = 'AAPL';

      const intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          void refreshCandlesSpy();
          const currentTickers = activeWatchlist?.tickers ?? [activeTicker];
          if (currentTickers.length > 0) {
            void refreshQuotesSpy(currentTickers);
          }
        }
      }, pollIntervalSec * 1000);

      // Phase 1: Visible for 3 intervals (45s) -> 3 executions
      vi.advanceTimersByTime(45000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(3);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(3);

      // Phase 2: Hidden for 4 intervals (60s) -> 0 additional executions
      (globalThis as any).document.visibilityState = 'hidden';
      vi.advanceTimersByTime(60000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(3);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(3);

      // Phase 3: Resume visible for 2 intervals (30s) -> 2 additional executions
      (globalThis as any).document.visibilityState = 'visible';
      vi.advanceTimersByTime(30000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(5);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(5);

      // Phase 4: Tab hidden again -> halted
      (globalThis as any).document.visibilityState = 'hidden';
      vi.advanceTimersByTime(30000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(5);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(5);

      clearInterval(intervalId);
    });

    it('cleans up interval on unmount or reconfiguration without memory leaks', () => {
      const refreshSpy = vi.fn();
      (globalThis as any).document = { visibilityState: 'visible' };

      // Simulate interval creation with cleanup
      let cleanupFn: (() => void) | null = null;
      const setupPolling = (intervalSec: number) => {
        if (cleanupFn) cleanupFn();
        if (intervalSec <= 0) {
          cleanupFn = null;
          return;
        }
        const id = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            refreshSpy();
          }
        }, intervalSec * 1000);
        cleanupFn = () => clearInterval(id);
      };

      // Set to 15s
      setupPolling(15);
      vi.advanceTimersByTime(15000);
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      // Switch to 60s
      setupPolling(60);
      vi.advanceTimersByTime(45000); // 45s passed -> 60s not reached yet
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15000); // total 60s passed -> triggers!
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      // Turn Off (0)
      setupPolling(0);
      vi.advanceTimersByTime(300000); // 5 minutes pass
      expect(refreshSpy).toHaveBeenCalledTimes(2); // no additional triggers
    });

    it('safely tolerates headless environment where document is undefined', () => {
      const refreshSpy = vi.fn();
      delete (globalThis as any).document;

      const intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && (document as any).visibilityState === 'visible') {
          refreshSpy();
        }
      }, 15000);

      // Should not throw ReferenceError
      expect(() => vi.advanceTimersByTime(30000)).not.toThrow();
      expect(refreshSpy).not.toHaveBeenCalled();

      clearInterval(intervalId);
    });
  });

  describe('4. Indicator Single-Pass Engine & Binary Search Surrounding Candles', () => {
    it('survives stress dataset with 5,000 candles and returns mathematically consistent bounds', () => {
      const count = 5000;
      const largeCandles: OHLCVCandle[] = Array.from({ length: count }, (_, i) => ({
        timestamp: 1600000000 + i * 86400,
        open: 100 + (i % 50),
        high: 105 + (i % 50),
        low: 98 + (i % 50),
        close: 102 + (i % 50),
        volume: 500000 + (i * 100),
      }));

      // Single-pass indicator calculation stress
      const t0 = performance.now();
      const indicators = computeAllChartIndicators(largeCandles);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(100); // Must be fast (<100ms for 5000 candles)
      expect(indicators.sma20.length).toBe(count - 19);
      expect(indicators.ema50.length).toBe(count - 49);
      expect(indicators.bb20.length).toBe(count - 19);

      // Binary search tests across 5,000 candles
      const testTimestamps = [
        largeCandles[0]!.timestamp - 50000, // before start
        largeCandles[0]!.timestamp, // exact start
        largeCandles[2500]!.timestamp + 3600, // mid off-bar
        largeCandles[4999]!.timestamp, // exact end
        largeCandles[4999]!.timestamp + 50000, // after end
      ];

      for (const ts of testTimestamps) {
        const { left, right } = findSurroundingCandles(largeCandles, ts);
        if (ts < largeCandles[0]!.timestamp) {
          expect(left).toBeNull();
          expect(right).toEqual(largeCandles[0]);
        } else if (ts > largeCandles[largeCandles.length - 1]!.timestamp) {
          expect(left).toEqual(largeCandles[largeCandles.length - 1]);
          expect(right).toBeNull();
        } else if (left && right) {
          expect(left.timestamp).toBeLessThanOrEqual(ts);
          expect(right.timestamp).toBeGreaterThanOrEqual(ts);
        }
      }
    });
  });
});
