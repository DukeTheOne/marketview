import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  extractLatestTradingDaySession,
  WorkspaceViewModeSchema,
  type OHLCVCandle,
  type TickerQuote,
} from '../../../core/schemas/market';
import { DailySessionSplitView } from '../DailySessionSplitView';

function generateDailyCandles(count: number, basePrice: number, startEpochSec = 1729728000): OHLCVCandle[] {
  const candles: OHLCVCandle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const timestamp = startEpochSec + i * 86400;
    const open = price;
    const close = Math.round((price + (i % 2 === 0 ? 2.5 : -1.5)) * 100) / 100;
    const high = Math.max(open, close) + 1.5;
    const low = Math.min(open, close) - 1.2;
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: 10_000_000 + i * 500_000,
    });
    price = close;
  }
  return candles;
}

function generateIntradayCandles(dayTimestamp: number, count: number, startPrice: number): OHLCVCandle[] {
  const candles: OHLCVCandle[] = [];
  let price = startPrice;
  const stepSec = 900; // 15-minute bars
  const dayStart = Math.floor(dayTimestamp / 86400) * 86400 + 34200; // 09:30 UTC
  for (let i = 0; i < count; i++) {
    const timestamp = dayStart + i * stepSec;
    const open = price;
    const close = Math.round((price + (i % 2 === 0 ? 0.8 : -0.4)) * 100) / 100;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: 250_000 + i * 10_000,
    });
    price = close;
  }
  return candles;
}

describe('Milestone 17: Workspace View Mode & Session Extractor Core Contracts', () => {
  it('validates WorkspaceViewModeSchema with historical and daily_1d', () => {
    expect(WorkspaceViewModeSchema.parse('historical')).toBe('historical');
    expect(WorkspaceViewModeSchema.parse('daily_1d')).toBe('daily_1d');
    expect(() => WorkspaceViewModeSchema.parse('invalid_mode')).toThrow();
  });

  describe('extractLatestTradingDaySession', () => {
    it('returns null when dailyCandles is empty', () => {
      expect(extractLatestTradingDaySession('AAPL', [])).toBeNull();
    });

    it('extracts session and synthesizes 16 intraday bars when no intradayCandles are provided', () => {
      const dailyCandles = generateDailyCandles(5, 150);
      const latestDaily = dailyCandles[dailyCandles.length - 1]!;
      const priorDaily = dailyCandles[dailyCandles.length - 2]!;

      const session = extractLatestTradingDaySession('AAPL', dailyCandles);

      expect(session).not.toBeNull();
      if (!session) return;

      expect(session.ticker).toBe('AAPL');
      expect(session.sessionDateTimestamp).toBe(latestDaily.timestamp);
      expect(session.open).toBe(latestDaily.open);
      expect(session.close).toBe(latestDaily.close);
      expect(session.high).toBe(latestDaily.high);
      expect(session.low).toBe(latestDaily.low);
      expect(session.previousClose).toBe(priorDaily.close);

      const expectedChange = Math.round((latestDaily.close - priorDaily.close) * 100) / 100;
      expect(session.change).toBe(expectedChange);
      expect(session.changePercent).toBe(
        Math.round(((expectedChange / priorDaily.close) * 100) * 100) / 100
      );

      // Synthesized 16 bars
      expect(session.bars.length).toBe(16);
      expect(session.bars[0]!.open).toBe(latestDaily.open);
      expect(session.bars[session.bars.length - 1]!.close).toBe(latestDaily.close);

      // Chronological timestamps
      for (let i = 1; i < session.bars.length; i++) {
        expect(session.bars[i]!.timestamp).toBeGreaterThan(session.bars[i - 1]!.timestamp);
      }
    });

    it('filters intradayCandles strictly to the latest trading day and discards older days', () => {
      const dailyCandles = generateDailyCandles(4, 200);
      const priorDaily = dailyCandles[dailyCandles.length - 2]!;
      const latestDaily = dailyCandles[dailyCandles.length - 1]!;

      // Generate 10 intraday bars for prior day and 12 intraday bars for latest day
      const priorDayIntraday = generateIntradayCandles(priorDaily.timestamp, 10, priorDaily.open);
      const latestDayIntraday = generateIntradayCandles(latestDaily.timestamp, 12, latestDaily.open);
      const mixedIntraday = [...priorDayIntraday, ...latestDayIntraday];

      const session = extractLatestTradingDaySession('NVDA', dailyCandles, mixedIntraday);

      expect(session).not.toBeNull();
      if (!session) return;

      expect(session.ticker).toBe('NVDA');
      expect(session.bars.length).toBe(12); // Only the 12 bars from latest day!
      expect(session.bars[0]!.open).toBe(latestDayIntraday[0]!.open);
      expect(session.bars[session.bars.length - 1]!.close).toBe(
        latestDayIntraday[latestDayIntraday.length - 1]!.close
      );
    });

    it('prefers quote.previousClose over priorDaily.close when provided', () => {
      const dailyCandles = generateDailyCandles(3, 100);
      const quote: TickerQuote = {
        ticker: 'MSFT',
        price: 105.5,
        change: 3.5,
        changePercent: 3.43,
        high: 106.0,
        low: 101.0,
        open: 102.0,
        previousClose: 102.0, // Explicit quote previousClose
        timestamp: 1729728000,
      };

      const session = extractLatestTradingDaySession('MSFT', dailyCandles, [], quote);

      expect(session).not.toBeNull();
      if (!session) return;

      expect(session.previousClose).toBe(102.0);
    });
  });
});

describe('Milestone 17: DailySessionSplitView UI Component', () => {
  it('renders dedicated left-half Latest Trading Day chart and right-half Daily Report space', () => {
    const dailyCandles = generateDailyCandles(5, 175);
    const handleBack = vi.fn();

    const html = renderToStaticMarkup(
      createElement(DailySessionSplitView, {
        ticker: 'AAPL',
        dailyCandles,
        onBackToHistoricalChart: handleBack,
      })
    );

    // Left Half Chart Pane and Key Elements
    expect(html).toContain('data-testid="daily-1d-chart-pane"');
    expect(html).toContain('AAPL');
    expect(html).toContain('Latest Trading Day (1D)');
    expect(html).toContain('data-testid="daily-1d-back-btn"');
    expect(html).toContain('Historical Chart');

    // Scannable Metrics Strip
    expect(html).toContain('data-testid="daily-1d-open"');
    expect(html).toContain('data-testid="daily-1d-close"');
    expect(html).toContain('data-testid="daily-1d-high"');
    expect(html).toContain('data-testid="daily-1d-low"');
    expect(html).toContain('data-testid="daily-1d-prev-close"');
    expect(html).toContain('data-testid="daily-1d-change"');

    // Right Half Reserved Daily Report Space
    expect(html).toContain('data-testid="daily-1d-report-pane"');
    expect(html).toContain('data-testid="daily-1d-report-placeholder"');
    expect(html).toContain('Daily Report Space');
    expect(html).toContain('Reserved');
  });

  it('renders empty fallback when dailyCandles is empty', () => {
    const html = renderToStaticMarkup(
      createElement(DailySessionSplitView, {
        ticker: 'TSLA',
        dailyCandles: [],
      })
    );

    expect(html).toContain('data-testid="daily-1d-empty-state"');
    expect(html).toContain('No trading session data available for TSLA');
  });

  it('renders loading indicator when isLoading is true and dailyCandles is empty', () => {
    const html = renderToStaticMarkup(
      createElement(DailySessionSplitView, {
        ticker: 'GOOGL',
        dailyCandles: [],
        isLoading: true,
      })
    );

    expect(html).toContain('data-testid="daily-1d-loading-state"');
    expect(html).toContain('Syncing latest trading day for GOOGL');
  });
});
