import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { IndicatorToolbar } from '../IndicatorToolbar';
import { ChartContainer } from '../ChartContainer';
import type { ChartIndicatorsSummary } from '../../../core/indicators/technicalIndicators';
import type { OHLCVCandle } from '../../../core/schemas/market';

describe('ChartContainer & Auto-Adaptive LOD Indicator', () => {
  const mockCandles: OHLCVCandle[] = [
    {
      timestamp: 1729728000,
      open: 150.0,
      high: 155.0,
      low: 148.0,
      close: 154.25,
      volume: 1000000,
    },
    {
      timestamp: 1729814400,
      open: 154.25,
      high: 157.0,
      low: 152.0,
      close: 156.5,
      volume: 1200000,
    },
  ];

  it('renders ChartContainer with default indicators including CANDLES and PRICE_15M', () => {
    const markup = renderToStaticMarkup(
      createElement(ChartContainer, {
        ticker: 'AAPL',
        timeframe: '1M',
        candles: mockCandles,
      })
    );

    expect(markup).toContain('indicator-toolbar');
    expect(markup).toContain('indicator-toggle-CANDLES');
    expect(markup).toContain('CANDLES');
    expect(markup).toContain('indicator-toggle-PRICE_15M');
    expect(markup).toContain('15m PRICE');
    expect(markup).toContain('156.50'); // latestPrice formatted readout
    expect(markup).toContain('indicator-toggle-VOLUME');
    expect(markup).toContain('indicator-toggle-SMA_20');
    expect(markup).toMatch(
      /data-testid="indicator-toggle-SMA_20"[^>]*aria-pressed="false"/
    );
  });

  describe('3-Tier Auto-Adaptive LOD', () => {
    it('Tier 1 (< 1M): auto-hides CANDLES (aria-pressed="false") and auto-shows PRICE_15M (aria-pressed="true") for 1D and 1W', () => {
      const markup1D = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: mockCandles,
        })
      );

      // In 1D: CANDLES is OFF, PRICE_15M is ON
      expect(markup1D).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="false"/
      );
      expect(markup1D).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="true"/
      );

      const markup1W = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1W',
          candles: mockCandles,
        })
      );

      // In 1W: CANDLES is OFF, PRICE_15M is ON
      expect(markup1W).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="false"/
      );
      expect(markup1W).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="true"/
      );
    });

    it('Tier 2 (1M to < 3M): auto-enables BOTH CANDLES (aria-pressed="true") and PRICE_15M (aria-pressed="true") for 1M', () => {
      const markup1M = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1M',
          candles: mockCandles,
        })
      );

      // In 1M: CANDLES is ON, PRICE_15M is ON
      expect(markup1M).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/
      );
      expect(markup1M).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="true"/
      );
    });

    it('Tier 3 (>= 3M): auto-enables CANDLES (aria-pressed="true") and auto-hides PRICE_15M (aria-pressed="false") for 3M and 1Y', () => {
      const markup3M = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '3M',
          candles: mockCandles,
        })
      );

      // In 3M: CANDLES is ON, PRICE_15M is OFF
      expect(markup3M).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/
      );
      expect(markup3M).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="false"/
      );

      const markup1Y = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1Y',
          candles: mockCandles,
        })
      );

      // In 1Y: CANDLES is ON, PRICE_15M is OFF
      expect(markup1Y).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/
      );
      expect(markup1Y).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="false"/
      );
    });
  });

  describe('IndicatorToolbar & Volume Stability', () => {
    it('shows active state and formatted price when CANDLES and PRICE_15M are active', () => {
      const summary: ChartIndicatorsSummary = {
        sma20: 152.3,
        ema50: null,
        vwap: 154.1,
        rsi14: 62.4,
        bb20: null,
        latestVolume: 1200000,
        latestPrice: 156.5,
      };

      const handleToggle = vi.fn();
      const markup = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: ['CANDLES', 'PRICE_15M', 'VOLUME'],
          onToggleIndicator: handleToggle,
          summary,
        })
      );

      expect(markup).toContain('data-testid="indicator-toggle-CANDLES"');
      expect(markup).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/
      );
      expect(markup).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="true"/
      );
      expect(markup).toMatch(
        /data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="true"/
      );
      expect(markup).toContain('156.50');
    });

    it('reflects inactive state when CANDLES is toggled off', () => {
      const summary: ChartIndicatorsSummary = {
        sma20: 152.3,
        ema50: null,
        vwap: null,
        rsi14: null,
        bb20: null,
        latestVolume: 1200000,
        latestPrice: 156.5,
      };

      const handleToggle = vi.fn();
      const markup = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: ['PRICE_15M', 'VOLUME'],
          onToggleIndicator: handleToggle,
          summary,
        })
      );

      expect(markup).toContain('data-testid="indicator-toggle-CANDLES"');
      expect(markup).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="false"/
      );
      expect(markup).toMatch(
        /data-testid="indicator-toggle-PRICE_15M"[^>]*aria-pressed="true"/
      );
    });

    it('supports repeated toggling of VOLUME without clearing CANDLES or breaking markup structure', () => {
      const summary: ChartIndicatorsSummary = {
        sma20: 152.3,
        ema50: null,
        vwap: null,
        rsi14: null,
        bb20: null,
        latestVolume: 1200000,
        latestPrice: 156.5,
      };

      // Toggle state 1: VOL on
      const state1 = ['CANDLES', 'VOLUME'] as const;
      const markup1 = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: [...state1],
          onToggleIndicator: vi.fn(),
          summary,
        })
      );
      expect(markup1).toMatch(/data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="true"/);
      expect(markup1).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/);

      // Toggle state 2: VOL off (first toggle)
      const state2 = ['CANDLES'] as const;
      const markup2 = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: [...state2],
          onToggleIndicator: vi.fn(),
          summary,
        })
      );
      expect(markup2).toMatch(/data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="false"/);
      expect(markup2).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/);

      // Toggle state 3: VOL on again (second toggle)
      const markup3 = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: [...state1],
          onToggleIndicator: vi.fn(),
          summary,
        })
      );
      expect(markup3).toMatch(/data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="true"/);
      expect(markup3).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/);

      // Toggle state 4: VOL off again (third toggle)
      const markup4 = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: [...state2],
          onToggleIndicator: vi.fn(),
          summary,
        })
      );
      expect(markup4).toMatch(/data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="false"/);
      expect(markup4).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*aria-pressed="true"/);
    });
  });
});
