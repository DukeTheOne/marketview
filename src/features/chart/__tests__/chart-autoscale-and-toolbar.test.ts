import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PRIMARY_TIMEFRAMES,
  TIMEFRAME_FOCUS_DAYS,
  computeTimeframeFocusWindow,
  type OHLCVCandle,
} from '../../../core/schemas/market';
import { ChartToolbar } from '../overlays/ChartToolbar';

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
});
