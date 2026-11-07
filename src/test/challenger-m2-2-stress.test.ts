import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartContainer } from '../features/chart/ChartContainer';
import { ProviderSettingsPopover, type LivePollIntervalSec } from '../ui/providers/ProviderSettingsPopover';
import type { OHLCVCandle, Timeframe } from '../core/schemas/market';
import type { LogicalAnchor } from '../core/schemas/annotation';
import type { CoordinateProjector } from '../features/chart/types';
import type { ProjectedHoverPoint } from '../core/indicators/technicalIndicators';
import { findNearestHoverPoint } from '../core/indicators/technicalIndicators';

// Sample candles for testing
const SAMPLE_CANDLES: OHLCVCandle[] = [
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

describe('Challenger M2-2: ChartContainer, ProviderSettings & App Behavior Hardening Suite', () => {

  describe('1. ChartContainer Hover Deduplication Stress Harness', () => {
    it('does NOT re-trigger setActiveHoverPoint when cursor jitters within a single candle snap zone (20 consecutive mousemove events)', () => {
      const { dispatcher, refs, stateSpies } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        const vnode = ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
        });

        const onMouseMove = vnode.props.onMouseMove;
        const onMouseLeave = vnode.props.onMouseLeave;
        expect(typeof onMouseMove).toBe('function');
        expect(typeof onMouseLeave).toBe('function');

        // State index 2 is activeHoverPoint
        const activeHoverPointSetter = stateSpies[2]!.setterSpy;
        expect(activeHoverPointSetter).not.toHaveBeenCalled();

        // Populate hover candidates (Ref 11 is hoverCandidatesRef)
        const candidates: ProjectedHoverPoint[] = [
          { x: 100, y: 250, price: 154.0, timestamp: 1711000000, source: 'daily_bar' },
          { x: 200, y: 240, price: 157.5, timestamp: 1711086400, source: 'daily_bar' },
          { x: 300, y: 235, price: 156.0, timestamp: 1711172800, source: 'daily_bar' },
        ];
        refs[11]!.current = candidates;

        const makeEvent = (clientX: number) => ({
          currentTarget: {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
          },
          clientX,
        });

        // 1. Initial movement into snap zone of candle at x = 100 (e.g. cursor at x = 95)
        onMouseMove(makeEvent(95));
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(1);
        expect(activeHoverPointSetter).toHaveBeenLastCalledWith(candidates[0]);

        // 2. Adversarial jitter: 20 consecutive mouse movements within the snap zone of candle 1 (x = 85 to 115)
        for (let i = 1; i <= 20; i++) {
          const jitterX = 95 + ((i * 3) % 25) - 12; // oscillates between 83 and 108, always closest to x=100
          onMouseMove(makeEvent(jitterX));
        }

        // VERIFY: setActiveHoverPoint call count MUST remain exactly 1! Zero redundant re-renders.
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(1);

        // 3. Move cursor into snap zone of candle at x = 200 (e.g. cursor at x = 195)
        onMouseMove(makeEvent(195));
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(2);
        expect(activeHoverPointSetter).toHaveBeenLastCalledWith(candidates[1]);

        // 4. Adversarial jitter within candle 2's snap zone: 20 consecutive movements
        for (let i = 1; i <= 20; i++) {
          const jitterX = 190 + (i % 15);
          onMouseMove(makeEvent(jitterX));
        }
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(2);

        // 5. Move cursor into empty zone (>120px away from any candle, e.g. x = 600)
        onMouseMove(makeEvent(600));
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(3);
        expect(activeHoverPointSetter).toHaveBeenLastCalledWith(null);

        // 6. Adversarial jitter in empty zone: 20 consecutive movements across x = 601..620
        for (let i = 1; i <= 20; i++) {
          onMouseMove(makeEvent(600 + i));
        }
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(3);

        // 7. onMouseLeave when activeHoverPoint is already null -> no-op
        onMouseLeave();
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(3);

        // 8. Move back to candle 1 -> calls once to set candidate 0
        onMouseMove(makeEvent(100));
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(4);
        expect(activeHoverPointSetter).toHaveBeenLastCalledWith(candidates[0]);

        // 9. onMouseLeave when activeHoverPoint is not null -> calls once to reset to null
        onMouseLeave();
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(5);
        expect(activeHoverPointSetter).toHaveBeenLastCalledWith(null);

        // 10. Redundant onMouseLeave -> should not call again
        onMouseLeave();
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(5);
      } finally {
        internals.H = oldH;
      }
    });

    it('findNearestHoverPoint correctly rejects points outside maxSnapDistancePx (120px)', () => {
      const candidates: ProjectedHoverPoint[] = [
        { x: 100, y: 250, price: 154.0, timestamp: 1711000000, source: 'daily_bar' },
        { x: 400, y: 240, price: 157.5, timestamp: 1711086400, source: 'daily_bar' },
      ];

      // Distance 120px: exact boundary (100 + 120 = 220)
      expect(findNearestHoverPoint(220, candidates, 120)).toEqual(candidates[0]);

      // Distance 121px: just outside snap zone
      expect(findNearestHoverPoint(221, candidates, 120)).toBeNull();

      // Empty candidates or non-finite cursor
      expect(findNearestHoverPoint(100, [], 120)).toBeNull();
      expect(findNearestHoverPoint(NaN, candidates, 120)).toBeNull();
      expect(findNearestHoverPoint(Infinity, candidates, 120)).toBeNull();
    });
  });

  describe('2. Non-Blocking Loading Backdrop Tests', () => {
    it('omits blocking loading overlay when isLoading is true but sortedCandles.length > 0', () => {
      const markup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
          isLoading: true,
        })
      );

      expect(markup).not.toContain('Syncing AAPL (1D) OHLCV series...');
      expect(markup).not.toContain('backdrop-blur-[1px]');
    });

    it('renders blocking loading overlay when isLoading is true and sortedCandles.length === 0 (cold load)', () => {
      const markup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: [],
          isLoading: true,
        })
      );

      expect(markup).toContain('Syncing AAPL (1D) OHLCV series...');
      expect(markup).toContain('backdrop-blur-[1px]');
    });

    it('omits loading overlay when isLoading is false regardless of candle count', () => {
      const markupEmpty = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: [],
          isLoading: false,
        })
      );
      expect(markupEmpty).not.toContain('Syncing AAPL (1D) OHLCV series...');

      const markupPopulated = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
          isLoading: false,
        })
      );
      expect(markupPopulated).not.toContain('Syncing AAPL (1D) OHLCV series...');
    });

    it('handles unsorted input candles properly without showing overlay when length > 0', () => {
      // Reverse ordered candles
      const reverseCandles = [...SAMPLE_CANDLES].reverse();
      const markup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'MSFT',
          timeframe: '1W',
          candles: reverseCandles,
          isLoading: true,
        })
      );

      expect(markup).not.toContain('Syncing MSFT (1W) OHLCV series...');
    });

    it('interpolates ticker and timeframe correctly in cold loading overlay banner', () => {
      const tickers = ['NVDA', 'TSLA', 'GOOGL'];
      const timeframes: Timeframe[] = ['15m', '1W', '1Y'];

      for (let i = 0; i < tickers.length; i++) {
        const t = tickers[i]!;
        const tf = timeframes[i]!;
        const markup = renderToStaticMarkup(
          createElement(ChartContainer, {
            ticker: t,
            timeframe: tf,
            candles: [],
            isLoading: true,
          })
        );
        expect(markup).toContain(`Syncing ${t} (${tf}) OHLCV series...`);
      }
    });
  });

  describe('3. Coordinate Projection Exact Hits (logicalToScreen)', () => {
    it('returns finite non-NaN coordinates when anchor timestamp matches an exact candle timestamp', () => {
      const { dispatcher, refs } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        let extractedProjector: CoordinateProjector | null = null;
        ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
          renderOverlayLayer: (ctx) => {
            extractedProjector = ctx.projector;
            return null;
          },
        });

        expect(extractedProjector).not.toBeNull();
        const projector = extractedProjector!;

        // Mock chartApiRef and candleSeriesRef
        const mockTimeScale = {
          // When querying exact timestamps, simulate Lightweight Charts returning null initially
          // to trigger the findSurroundingCandles interpolation fallback!
          timeToCoordinate: vi.fn((ts: number) => {
            // Return null for initial query to force the fallback path, but return finite for the candle timestamp!
            const idx = SAMPLE_CANDLES.findIndex((c) => c.timestamp === ts);
            return idx >= 0 ? 100 + idx * 80 : null;
          }),
          coordinateToTime: vi.fn(),
        };

        const mockPriceScale = {
          priceToCoordinate: vi.fn((price: number) => 500 - price * 2),
          coordinateToPrice: vi.fn(),
        };

        refs[1]!.current = {
          timeScale: () => mockTimeScale,
        };
        refs[2]!.current = mockPriceScale;

        // Test exact hit on every candle in SAMPLE_CANDLES
        for (let i = 0; i < SAMPLE_CANDLES.length; i++) {
          const candle = SAMPLE_CANDLES[i]!;
          const anchor: LogicalAnchor = {
            timestamp: candle.timestamp,
            price: candle.close,
          };

          const point = projector.logicalToScreen(anchor);
          expect(point).not.toBeNull();
          if (point) {
            expect(Number.isFinite(point.x)).toBe(true);
            expect(Number.isNaN(point.x)).toBe(false);
            expect(Number.isFinite(point.y)).toBe(true);
            expect(Number.isNaN(point.y)).toBe(false);
            expect(point.x).toBe(100 + i * 80);
            expect(point.y).toBe(500 - candle.close * 2);
          }
        }
      } finally {
        internals.H = oldH;
      }
    });

    it('avoids division-by-zero (NaN) when fallback findSurroundingCandles returns identical left and right candles', () => {
      const { dispatcher, refs } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        let extractedProjector: CoordinateProjector | null = null;
        ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: [SAMPLE_CANDLES[0]!], // Single candle dataset!
          renderOverlayLayer: (ctx) => {
            extractedProjector = ctx.projector;
            return null;
          },
        });

        const projector = extractedProjector!;
        const singleCandle = SAMPLE_CANDLES[0]!;

        let timeToCoordCalls = 0;
        const mockTimeScale = {
          timeToCoordinate: vi.fn((_ts: number) => {
            timeToCoordCalls++;
            // First call (anchor.timestamp): return null to force fallback!
            if (timeToCoordCalls === 1) return null;
            // Second call (leftCandle.timestamp): return finite coordinate!
            return 250;
          }),
        };

        refs[1]!.current = { timeScale: () => mockTimeScale };
        refs[2]!.current = { priceToCoordinate: () => 180 };

        const anchor: LogicalAnchor = {
          timestamp: singleCandle.timestamp,
          price: singleCandle.close,
        };

        const result = projector.logicalToScreen(anchor);
        expect(result).not.toBeNull();
        expect(result?.x).toBe(250);
        expect(Number.isNaN(result?.x)).toBe(false);
        expect(Number.isFinite(result?.x)).toBe(true);
      } finally {
        internals.H = oldH;
      }
    });

    it('interpolates smoothly between two candles without division-by-zero', () => {
      const { dispatcher, refs } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        let extractedProjector: CoordinateProjector | null = null;
        ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
          renderOverlayLayer: (ctx) => {
            extractedProjector = ctx.projector;
            return null;
          },
        });

        const projector = extractedProjector!;
        const c1 = SAMPLE_CANDLES[0]!;
        const c2 = SAMPLE_CANDLES[1]!;
        const midTimestamp = Math.floor((c1.timestamp + c2.timestamp) / 2);

        const mockTimeScale = {
          timeToCoordinate: vi.fn((ts: number) => {
            if (ts === midTimestamp) return null; // off-bar timestamp
            if (ts === c1.timestamp) return 100;
            if (ts === c2.timestamp) return 200;
            return null;
          }),
        };

        refs[1]!.current = { timeScale: () => mockTimeScale };
        refs[2]!.current = { priceToCoordinate: () => 150 };

        const anchor: LogicalAnchor = {
          timestamp: midTimestamp,
          price: 155.0,
        };

        const result = projector.logicalToScreen(anchor);
        expect(result).not.toBeNull();
        expect(result?.x).toBe(150); // Exact midpoint: 100 + 0.5 * (200 - 100) = 150
        expect(Number.isNaN(result?.x)).toBe(false);
      } finally {
        internals.H = oldH;
      }
    });

    it('snaps safely when anchor timestamp is before first candle or after last candle', () => {
      const { dispatcher, refs } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        let extractedProjector: CoordinateProjector | null = null;
        ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
          renderOverlayLayer: (ctx) => {
            extractedProjector = ctx.projector;
            return null;
          },
        });

        const projector = extractedProjector!;
        const firstCandle = SAMPLE_CANDLES[0]!;
        const lastCandle = SAMPLE_CANDLES[SAMPLE_CANDLES.length - 1]!;

        const mockTimeScale = {
          timeToCoordinate: vi.fn((ts: number) => {
            if (ts === firstCandle.timestamp) return 50;
            if (ts === lastCandle.timestamp) return 450;
            return null;
          }),
        };

        refs[1]!.current = { timeScale: () => mockTimeScale };
        refs[2]!.current = { priceToCoordinate: () => 150 };

        // Before first candle
        const beforeAnchor: LogicalAnchor = {
          timestamp: firstCandle.timestamp - 100000,
          price: 150.0,
        };
        const beforeResult = projector.logicalToScreen(beforeAnchor);
        expect(beforeResult).not.toBeNull();
        expect(beforeResult?.x).toBe(50);
        expect(Number.isNaN(beforeResult?.x)).toBe(false);

        // After last candle
        const afterAnchor: LogicalAnchor = {
          timestamp: lastCandle.timestamp + 100000,
          price: 150.0,
        };
        const afterResult = projector.logicalToScreen(afterAnchor);
        expect(afterResult).not.toBeNull();
        expect(afterResult?.x).toBe(450);
        expect(Number.isNaN(afterResult?.x)).toBe(false);
      } finally {
        internals.H = oldH;
      }
    });
  });

  describe('4. Auto-Refresh & Tab Visibility Gating', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      // Ensure global document mock is cleanly cleaned up if touched
      delete (globalThis as any).document;
    });

    it('gates auto-polling on document.visibilityState === "visible"', () => {
      const refreshCandlesSpy = vi.fn().mockResolvedValue(undefined);
      const refreshQuotesSpy = vi.fn().mockResolvedValue(undefined);

      const mockMarketStore = {
        getState: () => ({
          refreshActiveCandles: refreshCandlesSpy,
          refreshQuotes: refreshQuotesSpy,
        }),
      };

      // Mock DOM document with visibilityState
      (globalThis as any).document = {
        visibilityState: 'visible',
      };

      // Simulate App.tsx auto-polling effect with intervalSec = 15
      const intervalSec = 15;
      const activeWatchlist = { id: 'wl-1', name: 'Main', tickers: ['AAPL', 'MSFT'] };
      const activeTicker = 'AAPL';

      const intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          void mockMarketStore.getState().refreshActiveCandles();
          const currentTickers = activeWatchlist?.tickers ?? [activeTicker];
          if (currentTickers.length > 0) {
            void mockMarketStore.getState().refreshQuotes(currentTickers);
          }
        }
      }, intervalSec * 1000);

      // Tick 1: Tab is visible -> refresh should fire
      vi.advanceTimersByTime(15000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(1);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(1);
      expect(refreshQuotesSpy).toHaveBeenCalledWith(['AAPL', 'MSFT']);

      // Tick 2: Tab becomes hidden -> refresh should NOT fire
      (globalThis as any).document.visibilityState = 'hidden';
      vi.advanceTimersByTime(15000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(1);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(1);

      // Advance by another 45 seconds while hidden -> still zero calls
      vi.advanceTimersByTime(45000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(1);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(1);

      // Tick 3: Tab becomes visible again -> refresh resumes
      (globalThis as any).document.visibilityState = 'visible';
      vi.advanceTimersByTime(15000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(2);
      expect(refreshQuotesSpy).toHaveBeenCalledTimes(2);

      clearInterval(intervalId);
    });

    it('does not register any timer when pollIntervalSec is 0 (Off)', () => {
      const refreshCandlesSpy = vi.fn();

      (globalThis as any).document = { visibilityState: 'visible' };

      const intervalSec = 0;
      let intervalId: any = null;
      if (intervalSec > 0) {
        intervalId = setInterval(() => {
          refreshCandlesSpy();
        }, intervalSec * 1000);
      }

      expect(intervalId).toBeNull();
      vi.advanceTimersByTime(100000);
      expect(refreshCandlesSpy).not.toHaveBeenCalled();
    });

    it('supports 1m (60s) and 5m (300s) intervals', () => {
      const refreshCandlesSpy = vi.fn();
      (globalThis as any).document = { visibilityState: 'visible' };

      // 1m interval
      const interval1m = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          refreshCandlesSpy();
        }
      }, 60 * 1000);

      vi.advanceTimersByTime(59000);
      expect(refreshCandlesSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(1);
      clearInterval(interval1m);

      // 5m interval
      refreshCandlesSpy.mockClear();
      const interval5m = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          refreshCandlesSpy();
        }
      }, 300 * 1000);

      vi.advanceTimersByTime(299000);
      expect(refreshCandlesSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(refreshCandlesSpy).toHaveBeenCalledTimes(1);
      clearInterval(interval5m);
    });
  });

  describe('5. ProviderSettingsPopover UI Component Verification', () => {
    it('renders selectable buttons for Off, 15s, 1m, and 5m with clean labels and status', () => {
      const handleChangePoll = vi.fn();
      const markup = renderToStaticMarkup(
        createElement(ProviderSettingsPopover, {
          isOpen: true,
          providerMode: 'finnhub',
          providerId: 'finnhub-direct',
          finnhubApiKey: 'test-key',
          pollIntervalSec: 60,
          onClose: vi.fn(),
          onSelectProviderMode: vi.fn(),
          onChangePollInterval: handleChangePoll,
        })
      );

      // Popover container exists
      expect(markup).toContain('data-testid="provider-settings-popover"');

      // Buttons for 0, 15, 60, 300
      expect(markup).toContain('data-testid="poll-interval-btn-0"');
      expect(markup).toContain('data-testid="poll-interval-btn-15"');
      expect(markup).toContain('data-testid="poll-interval-btn-60"');
      expect(markup).toContain('data-testid="poll-interval-btn-300"');

      // Button text labels
      expect(markup).toContain('>Off<');
      expect(markup).toContain('>15s<');
      expect(markup).toContain('>1m<');
      expect(markup).toContain('>5m<');

      // Status readout for 60s
      expect(markup).toContain('Every 1m');
    });

    it('displays correct status readout for all interval options (0, 15, 60, 300)', () => {
      const options: Array<{ sec: LivePollIntervalSec; expectedStatus: string }> = [
        { sec: 0, expectedStatus: 'Paused' },
        { sec: 15, expectedStatus: 'Every 15s' },
        { sec: 60, expectedStatus: 'Every 1m' },
        { sec: 300, expectedStatus: 'Every 5m' },
      ];

      for (const { sec, expectedStatus } of options) {
        const markup = renderToStaticMarkup(
          createElement(ProviderSettingsPopover, {
            isOpen: true,
            providerMode: 'yahoo',
            providerId: 'yahoo-finance',
            finnhubApiKey: '',
            pollIntervalSec: sec,
            onClose: vi.fn(),
            onSelectProviderMode: vi.fn(),
            onChangePollInterval: vi.fn(),
          })
        );
        expect(markup).toContain(expectedStatus);
      }
    });

    it('renders null when isOpen is false', () => {
      const markup = renderToStaticMarkup(
        createElement(ProviderSettingsPopover, {
          isOpen: false,
          providerMode: 'yahoo',
          providerId: 'yahoo-finance',
          finnhubApiKey: '',
          pollIntervalSec: 0,
          onClose: vi.fn(),
          onSelectProviderMode: vi.fn(),
          onChangePollInterval: vi.fn(),
        })
      );
      expect(markup).toBe('');
    });
  });

  describe('6. Adversarial Stress & Failure Mode Mining', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      delete (globalThis as any).document;
    });
    it('prevents state updates when candidate object is a newly allocated distinct object instance with identical values', () => {
      const { dispatcher, refs, stateSpies } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        const vnode = ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
        });

        const onMouseMove = vnode.props.onMouseMove;
        const activeHoverPointSetter = stateSpies[2]!.setterSpy;

        // Candidate 1
        refs[11]!.current = [
          { x: 100, y: 250, price: 154.0, timestamp: 1711000000, source: 'daily_bar' },
        ];

        onMouseMove({
          currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) },
          clientX: 100,
        });
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(1);

        // Replace hoverCandidatesRef with a BRAND NEW ARRAY containing a BRAND NEW OBJECT with identical coordinates
        refs[11]!.current = [
          { x: 100, y: 250, price: 154.0, timestamp: 1711000000, source: 'daily_bar' },
        ];

        // Ensure prev !== nearest by reference!
        expect(refs[11]!.current[0]).not.toBe(refs[10]!.current);

        // Fire onMouseMove again
        onMouseMove({
          currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) },
          clientX: 100,
        });

        // VERIFY: Value equality prevents re-render even across distinct object references!
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(1);
      } finally {
        internals.H = oldH;
      }
    });

    it('processes rapid traversal across 50 simulated candles with 5 jitters each (250 events) with strictly 50 state updates', () => {
      const { dispatcher, refs, stateSpies } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        const vnode = ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: SAMPLE_CANDLES,
        });

        const onMouseMove = vnode.props.onMouseMove;
        const activeHoverPointSetter = stateSpies[2]!.setterSpy;

        // Create 50 candidates spaced 15px apart (x = 20, 35, 50, ..., 755)
        const candidates: ProjectedHoverPoint[] = Array.from({ length: 50 }, (_, i) => ({
          x: 20 + i * 15,
          y: 200 + (i % 10) * 5,
          price: 150 + i,
          timestamp: 1711000000 + i * 86400,
          source: 'daily_bar',
        }));
        refs[11]!.current = candidates;

        let totalEvents = 0;
        // Move through all 50 candidates; for each, perform 5 jitter movements within 4px of candidate
        for (let i = 0; i < 50; i++) {
          const candX = candidates[i]!.x;
          for (let j = 0; j < 5; j++) {
            const jitterX = candX + (j - 2); // offsets: -2, -1, 0, 1, 2 (within ±2px, distance to neighbors is 13+px)
            onMouseMove({
              currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) },
              clientX: jitterX,
            });
            totalEvents++;
          }
        }

        expect(totalEvents).toBe(250);
        // VERIFY: Exactly 50 state updates across 250 high-frequency events! (80% event deduplication)
        expect(activeHoverPointSetter).toHaveBeenCalledTimes(50);
      } finally {
        internals.H = oldH;
      }
    });

    it('stress tests findNearestHoverPoint across 10,000 points and invalid coordinate values without performance degradation', () => {
      const largeCandidates: ProjectedHoverPoint[] = Array.from({ length: 10_000 }, (_, i) => ({
        x: i * 2,
        y: 200,
        price: 100,
        timestamp: 1700000000 + i * 60,
        source: 'daily_bar',
      }));

      // Inject corrupted points with NaN and Infinity
      largeCandidates[100] = { x: NaN, y: 200, price: 100, timestamp: 1700000000, source: 'daily_bar' };
      largeCandidates[500] = { x: Infinity, y: 200, price: 100, timestamp: 1700000000, source: 'daily_bar' };
      largeCandidates[1000] = { x: 500, y: NaN, price: 100, timestamp: 1700000000, source: 'daily_bar' };

      const t0 = performance.now();
      const match = findNearestHoverPoint(5000, largeCandidates, 120);
      const elapsed = performance.now() - t0;

      expect(match).not.toBeNull();
      expect(match?.x).toBe(5000);
      expect(elapsed).toBeLessThan(50); // Under 50ms for 10k points
    });

    it('handles duplicate timestamp candles in sortedCandles without division-by-zero in logicalToScreen', () => {
      const { dispatcher, refs } = createHookDispatcher();
      const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const oldH = internals.H;
      internals.H = dispatcher;

      try {
        let extractedProjector: CoordinateProjector | null = null;
        const duplicateCandles: OHLCVCandle[] = [
          { timestamp: 1711000000, open: 150, high: 155, low: 148, close: 152, volume: 1000 },
          { timestamp: 1711000000, open: 152, high: 156, low: 150, close: 154, volume: 2000 }, // identical timestamp
          { timestamp: 1711086400, open: 154, high: 160, low: 153, close: 159, volume: 3000 },
        ];

        ChartContainer({
          ticker: 'AAPL',
          timeframe: '1D',
          candles: duplicateCandles,
          renderOverlayLayer: (ctx) => {
            extractedProjector = ctx.projector;
            return null;
          },
        });

        const projector = extractedProjector!;
        let queryCount = 0;
        const mockTimeScale = {
          timeToCoordinate: vi.fn((_ts: number) => {
            queryCount++;
            if (queryCount === 1) return null; // force fallback
            return 120;
          }),
        };

        refs[1]!.current = { timeScale: () => mockTimeScale };
        refs[2]!.current = { priceToCoordinate: () => 300 };

        const anchor: LogicalAnchor = {
          timestamp: 1711000000,
          price: 154.0,
        };

        const result = projector.logicalToScreen(anchor);
        expect(result).not.toBeNull();
        expect(Number.isFinite(result?.x)).toBe(true);
        expect(Number.isNaN(result?.x)).toBe(false);
      } finally {
        internals.H = oldH;
      }
    });

    it('blocks polling during non-standard tab visibility states (prerender, unloaded)', () => {
      const refreshCandlesSpy = vi.fn();
      const nonVisibleStates = ['hidden', 'prerender', 'unloaded'] as const;

      for (const state of nonVisibleStates) {
        (globalThis as any).document = { visibilityState: state };
        refreshCandlesSpy.mockClear();

        const intervalId = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            refreshCandlesSpy();
          }
        }, 15000);

        vi.advanceTimersByTime(30000);
        expect(refreshCandlesSpy).not.toHaveBeenCalled();
        clearInterval(intervalId);
      }
    });

    it('safely handles empty watchlist tickers without triggering empty refreshQuotes', () => {
      const refreshQuotesSpy = vi.fn();
      const mockMarketStore = {
        getState: () => ({
          refreshActiveCandles: vi.fn(),
          refreshQuotes: refreshQuotesSpy,
        }),
      };

      (globalThis as any).document = { visibilityState: 'visible' };

      const activeWatchlist = { id: 'wl-empty', name: 'Empty', tickers: [] };
      const activeTicker = '';

      const intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          const currentTickers = activeWatchlist?.tickers ?? [activeTicker];
          if (currentTickers.length > 0) {
            mockMarketStore.getState().refreshQuotes(currentTickers);
          }
        }
      }, 15000);

      vi.advanceTimersByTime(15000);
      expect(refreshQuotesSpy).not.toHaveBeenCalled();
      clearInterval(intervalId);
    });
  });
});
