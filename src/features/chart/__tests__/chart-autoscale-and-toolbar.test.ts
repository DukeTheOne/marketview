import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INITIAL_TIMEFRAME,
  PRIMARY_TIMEFRAMES,
  TIMEFRAME_FOCUS_DAYS,
  computeCarryOverLogicalRange,
  computeTimeframeFocusWindow,
  type LogicalRangeWindow,
  type OHLCVCandle,
} from '../../../core/schemas/market';
import { ChartToolbar } from '../overlays/ChartToolbar';
import { ChartContainer } from '../ChartContainer';
import { TopHeaderBar } from '../../../ui/layout/TopHeaderBar';

function generateCandles(
  count: number,
  basePrice: number,
  startEpochSec = 1700000000,
  stepSec = 86400
): OHLCVCandle[] {
  const candles: OHLCVCandle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i += 1) {
    const timestamp = startEpochSec + i * stepSec;
    const open = price;
    const close = Math.round((price + (i % 2 === 0 ? 1.0 : -1.0)) * 100) / 100;
    const high = Math.max(open, close) + 2;
    const low = Math.min(open, close) - 2;
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: 1_000_000 + i * 10_000,
    });
    price = close;
  }
  return candles;
}

describe('Chart Autoscale & Viewport Focus Logic', () => {
  it('computes valid focus window timestamps across all primary timeframes', () => {
    const candles365 = generateCandles(365, 300);
    const latestTimestamp = candles365[candles365.length - 1]!.timestamp;

    for (const tf of PRIMARY_TIMEFRAMES) {
      const window = computeTimeframeFocusWindow(candles365, tf);
      expect(window).not.toBeNull();
      if (!window) continue;

      expect(window.to).toBe(latestTimestamp);
      expect(window.from).toBeLessThanOrEqual(window.to);

      // Verify at least 5 bars are included in every window
      const expectedDays = TIMEFRAME_FOCUS_DAYS[tf];
      expect(expectedDays).toBeGreaterThan(0);
      const visibleBars = candles365.filter(
        (c) => c.timestamp >= window.from && c.timestamp <= window.to
      );
      expect(visibleBars.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('correctly maps focus window to logical bar indices when switching from Stock A ($300) to Stock B ($150)', () => {
    const stockACandles = generateCandles(365, 300);
    const stockBCandles = generateCandles(365, 150);

    // Stock A price range is centered around ~300
    const stockAWindow = computeTimeframeFocusWindow(stockACandles, '1M');
    expect(stockAWindow).not.toBeNull();
    const stockAFromIndex = stockACandles.findIndex(
      (c) => c.timestamp >= stockAWindow!.from
    );
    const stockAToIndex = stockACandles.length - 1;
    const stockAVisibleCandles = stockACandles.slice(
      stockAFromIndex,
      stockAToIndex + 1
    );
    const stockAMinLow = Math.min(...stockAVisibleCandles.map((c) => c.low));
    const stockAMaxHigh = Math.max(...stockAVisibleCandles.map((c) => c.high));

    expect(stockAMinLow).toBeGreaterThan(250);
    expect(stockAMaxHigh).toBeGreaterThan(290);

    // Stock B price range is centered around ~150
    const stockBWindow = computeTimeframeFocusWindow(stockBCandles, '1M');
    expect(stockBWindow).not.toBeNull();
    const stockBFromIndex = stockBCandles.findIndex(
      (c) => c.timestamp >= stockBWindow!.from
    );
    const stockBToIndex = stockBCandles.length - 1;
    const stockBVisibleCandles = stockBCandles.slice(
      stockBFromIndex,
      stockBToIndex + 1
    );
    const stockBMinLow = Math.min(...stockBVisibleCandles.map((c) => c.low));
    const stockBMaxHigh = Math.max(...stockBVisibleCandles.map((c) => c.high));

    expect(stockBMinLow).toBeGreaterThan(120);
    expect(stockBMaxHigh).toBeLessThan(200);

    // Verify Stock B indices are valid and non-overlapping with Stock A's price regime
    expect(stockBFromIndex).toBeGreaterThanOrEqual(0);
    expect(stockBToIndex).toBe(stockBCandles.length - 1);
    expect(stockBMaxHigh).toBeLessThan(stockAMinLow);
  });

  it('renders ChartToolbar positioned safely away from the right Y-axis (right-28 class)', () => {
    const html = renderToStaticMarkup(
      createElement(ChartToolbar, {
        activeTool: null,
        annotationCount: 2,
        onSelectTool: () => {},
        showAdvancedTools: false,
      })
    );

    // Verify right-28 offset is used so the toolbar never overlaps the right price scale
    expect(html).toContain('right-28');
    expect(html).not.toContain('right-4');

    // Minimalist mode: only Pointer, Sticker, and Trendline should be visible
    expect(html).toContain('Pointer');
    expect(html).toContain('Sticker');
    expect(html).toContain('Trendline');
    expect(html).not.toContain('Fibonacci');
    expect(html).not.toContain('Trade Marker');
  });

  it('defaults showAdvancedTools to false so Fibonacci and Trade Marker are hidden when prop is omitted', () => {
    const html = renderToStaticMarkup(
      createElement(ChartToolbar, {
        activeTool: null,
        annotationCount: 0,
        onSelectTool: () => {},
      })
    );

    expect(html).toContain('Pointer');
    expect(html).toContain('Sticker');
    expect(html).toContain('Trendline');
    expect(html).not.toContain('Fib');
    expect(html).not.toContain('Trade Marker');
  });
});

describe('Milestone 16: Free 2D Chart Dragging & Persistent Viewing Scope Core Logic', () => {
  it('defines DEFAULT_INITIAL_TIMEFRAME as 3M', () => {
    expect(DEFAULT_INITIAL_TIMEFRAME).toBe('3M');
  });

  describe('computeCarryOverLogicalRange', () => {
    it('preserves exact logical range when switching between stocks with the same bar count', () => {
      // User initially had 365 bars and zoomed into 25 bars near the latest bar
      const userViewingScope: LogicalRangeWindow = { from: 339, to: 364 };
      const carriedOver = computeCarryOverLogicalRange(userViewingScope, 365, 365);

      expect(carriedOver).toEqual({ from: 339, to: 364 });
      expect(carriedOver!.to - carriedOver!.from).toBe(25);
    });

    it('preserves exact zoom span and right-edge offset when switching to a stock with fewer bars', () => {
      // Zoomed to 25 bars at the right edge (offset = 0)
      const userViewingScope: LogicalRangeWindow = { from: 339, to: 364 };
      const carriedOver = computeCarryOverLogicalRange(userViewingScope, 365, 120);

      expect(carriedOver).toEqual({ from: 94, to: 119 });
      expect(carriedOver!.to - carriedOver!.from).toBe(25);
      expect(carriedOver!.to).toBe(119); // right edge of 120 bars (index 119)
    });

    it('preserves exact zoom span and right-edge offset when switching to a stock with more bars', () => {
      // Zoomed to 25 bars at the right edge (offset = 0)
      const userViewingScope: LogicalRangeWindow = { from: 339, to: 364 };
      const carriedOver = computeCarryOverLogicalRange(userViewingScope, 365, 730);

      expect(carriedOver).toEqual({ from: 704, to: 729 });
      expect(carriedOver!.to - carriedOver!.from).toBe(25);
      expect(carriedOver!.to).toBe(729);
    });

    it('preserves historical pan offset when user was scrolled back in time', () => {
      // User was viewing 30 bars, panned back 15 bars from the right edge
      // prevLastIndex = 364, to = 349 (offset = -15), from = 319 (span = 30)
      const userViewingScope: LogicalRangeWindow = { from: 319, to: 349 };
      const carriedOver = computeCarryOverLogicalRange(userViewingScope, 365, 120);

      // nextLastIndex = 119, target to = 119 - 15 = 104, from = 104 - 30 = 74
      expect(carriedOver).toEqual({ from: 74, to: 104 });
      expect(carriedOver!.to - carriedOver!.from).toBe(30);
    });

    it('gracefully clamps right edge to minimum visible bars when switching to a newly listed stock', () => {
      // Deep historical pan on 365 bars: user viewing bars 10..40
      // prevLastIndex = 364, rightOffset = 40 - 364 = -324
      const userViewingScope: LogicalRangeWindow = { from: 10, to: 40 };
      const carriedOver = computeCarryOverLogicalRange(userViewingScope, 365, 20);

      // nextLastIndex = 19, rawTargetTo = 19 - 324 = -305
      // minVisibleRightIndex = Math.min(4, 19) = 4
      // clampedTo = Math.max(4, -305) = 4
      // from = 4 - 30 = -26
      expect(carriedOver).toEqual({ from: -26, to: 4 });
      expect(carriedOver!.to - carriedOver!.from).toBe(30);
      expect(carriedOver!.to).toBe(4);
    });

    it('returns null on invalid inputs (non-positive nextBarCount, inverted range, or non-finite numbers)', () => {
      expect(
        computeCarryOverLogicalRange({ from: 10, to: 50 }, 100, 0)
      ).toBeNull();
      expect(
        computeCarryOverLogicalRange({ from: 10, to: 50 }, 100, -5)
      ).toBeNull();
      expect(
        computeCarryOverLogicalRange({ from: 50, to: 10 }, 100, 100)
      ).toBeNull();
      expect(
        computeCarryOverLogicalRange({ from: NaN, to: 50 }, 100, 100)
      ).toBeNull();
      expect(
        computeCarryOverLogicalRange({ from: 10, to: Infinity }, 100, 100)
      ).toBeNull();
    });

    it('handles prevBarCount <= 0 by anchoring to next stock last index', () => {
      const carriedOver = computeCarryOverLogicalRange(
        { from: 10, to: 50 },
        0,
        100
      );
      expect(carriedOver).toEqual({ from: 59, to: 99 });
      expect(carriedOver!.to - carriedOver!.from).toBe(40);
    });
  });

  it('demonstrates workflow: 3M initial scope followed by custom zoom carry-over across tickers', () => {
    const stockACandles = generateCandles(365, 200);
    const stockBCandles = generateCandles(365, 100);

    // 1. Initial launch focuses 3M
    const initial3MWindow = computeTimeframeFocusWindow(
      stockACandles,
      DEFAULT_INITIAL_TIMEFRAME
    );
    expect(initial3MWindow).not.toBeNull();
    const fromIndex = stockACandles.findIndex(
      (c) => c.timestamp >= initial3MWindow!.from
    );
    const toIndex = stockACandles.length - 1;
    const initialSpan = toIndex - fromIndex;
    expect(initialSpan).toBeGreaterThanOrEqual(60);

    // 2. User zooms into 20 bars
    const userZoomedScope: LogicalRangeWindow = {
      from: toIndex - 20,
      to: toIndex,
    };

    // 3. Switching to Stock B carries over the 20-bar viewing scope
    const carriedScope = computeCarryOverLogicalRange(
      userZoomedScope,
      stockACandles.length,
      stockBCandles.length
    );
    expect(carriedScope).not.toBeNull();
    expect(carriedScope!.to - carriedScope!.from).toBe(20);
    expect(carriedScope!.to).toBe(stockBCandles.length - 1);
  });
});

describe('Milestone 16: Momentary Scope Action Buttons & Chart Drag Pane UI', () => {
  it('renders TopHeaderBar timeframe buttons as momentary action buttons without persistent toggle class', () => {
    const html = renderToStaticMarkup(
      createElement(TopHeaderBar, {
        activeTicker: 'AAPL',
        quote: undefined,
        providerId: 'demo',
        isLoading: false,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
      })
    );

    // All primary timeframe buttons rendered with testid and non-pulsing default state
    for (const tf of PRIMARY_TIMEFRAMES) {
      expect(html).toContain(`data-testid="timeframe-btn-${tf}"`);
      expect(html).toContain('data-pulsing="false"');
      expect(html).toContain(`title="Focus ${tf} scope"`);
    }

    // Must NOT contain the permanent toggle class (bg-emerald-500 text-slate-950)
    expect(html).not.toContain('bg-emerald-500 text-slate-950');
  });

  it('renders ChartContainer with cursor-default on the chart pane and clean watermark without static timeframe pill', () => {
    const candles = generateCandles(10, 150);
    const html = renderToStaticMarkup(
      createElement(ChartContainer, {
        ticker: 'NVDA',
        timeframe: '3M',
        candles,
      })
    );

    // Chart pane has cursor-default by default (clean standard arrow at rest)
    expect(html).toContain('data-testid="chart-pane"');
    expect(html).toContain('cursor-default');
    expect(html).not.toContain('cursor-grab');

    // Watermark displays ticker and bar count
    expect(html).toContain('NVDA');
    expect(html).toContain('10 bars');

    // Does not render a static timeframe pill badge in watermark
    expect(html).not.toMatch(/px-2 py-0\.5 font-mono text-xs[^>]*3M/);
  });
});
