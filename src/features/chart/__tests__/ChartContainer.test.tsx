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

  it('renders ChartContainer with default indicators including unified CANDLE / PRICE toggle and VOLUME', () => {
    const markup = renderToStaticMarkup(
      createElement(ChartContainer, {
        ticker: 'AAPL',
        timeframe: '1M',
        candles: mockCandles,
      })
    );

    expect(markup).toContain('indicator-toolbar');
    expect(markup).toContain('indicator-toggle-CANDLES');
    expect(markup).toContain('data-chart-style="CANDLES"');
    expect(markup).toContain('CANDLE');
    expect(markup).toContain('PRICE');
    expect(markup).not.toContain('indicator-toggle-PRICE_15M');
    expect(markup).toContain('156.50'); // latestPrice formatted readout
    expect(markup).toContain('indicator-toggle-VOLUME');
    expect(markup).toContain('indicator-toggle-SMA_20');
    expect(markup).toMatch(
      /data-testid="indicator-toggle-SMA_20"[^>]*aria-pressed="false"/
    );
  });

  describe('Exclusive CANDLES vs PRICE_15M Primary Style Mode', () => {
    it('defaults to CANDLES mode across all timeframes (1D, 1W, 1M, 3M, 1Y)', () => {
      const timeframes = ['1D', '1W', '1M', '3M', '1Y'] as const;

      for (const tf of timeframes) {
        const markup = renderToStaticMarkup(
          createElement(ChartContainer, {
            ticker: 'AAPL',
            timeframe: tf,
            candles: mockCandles,
          })
        );

        // Always defaults to CANDLES mode across every timeframe
        expect(markup).toMatch(
          /data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="CANDLES"/
        );
        expect(markup).not.toContain('data-testid="indicator-toggle-PRICE_15M"');
      }
    });

    it('renders PRICE active styling when initialized with PRICE_15M mode', () => {
      const markup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: mockCandles,
          defaultIndicators: ['PRICE_15M', 'VOLUME'],
        })
      );

      expect(markup).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="PRICE_15M"/
      );
      expect(markup).toContain('text-blue-200');
    });
  });

  describe('IndicatorToolbar & Volume Stability', () => {
    it('shows active CANDLES state and formatted price readout', () => {
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
          activeIndicators: ['CANDLES', 'VOLUME'],
          onToggleIndicator: handleToggle,
          summary,
        })
      );

      expect(markup).toContain('data-testid="indicator-toggle-CANDLES"');
      expect(markup).toMatch(
        /data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="CANDLES"/
      );
      expect(markup).toMatch(
        /data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="true"/
      );
      expect(markup).toContain('156.50');
    });

    it('reflects PRICE_15M state when toggled to PRICE mode', () => {
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
        /data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="PRICE_15M"/
      );
      expect(markup).toContain('text-blue-200 font-bold');
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
      expect(markup1).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="CANDLES"/);

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
      expect(markup2).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="CANDLES"/);

      // Toggle state 3: VOL on again (second toggle)
      const markup3 = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: [...state1],
          onToggleIndicator: vi.fn(),
          summary,
        })
      );
      expect(markup3).toMatch(/data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="true"/);
      expect(markup3).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="CANDLES"/);

      // Toggle state 4: VOL off again (third toggle)
      const markup4 = renderToStaticMarkup(
        createElement(IndicatorToolbar, {
          activeIndicators: [...state2],
          onToggleIndicator: vi.fn(),
          summary,
        })
      );
      expect(markup4).toMatch(/data-testid="indicator-toggle-VOLUME"[^>]*aria-pressed="false"/);
      expect(markup4).toMatch(/data-testid="indicator-toggle-CANDLES"[^>]*data-chart-style="CANDLES"/);
    });
  });

  describe('Non-Blocking Loading Overlay', () => {
    it('omits blocking loading overlay during background refresh when candles already exist', () => {
      const markup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: mockCandles,
          isLoading: true,
        })
      );
      expect(markup).not.toContain('Syncing AAPL (1D) OHLCV series...');
    });

    it('renders blocking loading overlay during initial cold load when candles array is empty', () => {
      const markup = renderToStaticMarkup(
        createElement(ChartContainer, {
          ticker: 'AAPL',
          timeframe: '1D',
          candles: [],
          isLoading: true,
        })
      );
      expect(markup).toContain('Syncing AAPL (1D) OHLCV series...');
    });
  });
});
