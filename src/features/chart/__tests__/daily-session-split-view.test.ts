import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  buildTickerDetailedReport,
  extractLatestTradingDaySession,
  WorkspaceViewModeSchema,
  type OHLCVCandle,
  type TickerQuote,
} from '../../../core/schemas/market';
import {
  DailySessionSplitView,
  StockDetailSplitPanel,
} from '../DailySessionSplitView';
import { TopHeaderBar } from '../../../ui/layout/TopHeaderBar';

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

describe('Milestone 18: buildTickerDetailedReport Headless Core Contracts', () => {
  it('returns null when dailyCandles is empty', () => {
    expect(buildTickerDetailedReport('AAPL', [])).toBeNull();
  });

  it('builds a detailed report for an individual stock (e.g. AAPL) with stock pulse', () => {
    const dailyCandles = generateDailyCandles(30, 150);
    const report = buildTickerDetailedReport('AAPL', dailyCandles);

    expect(report).not.toBeNull();
    if (!report) return;

    expect(report.ticker).toBe('AAPL');
    expect(report.instrumentType).toBe('stock');
    expect(report.name).toContain('Apple');
    expect(report.exchange).toBe('NASDAQ');

    // Range invariant: historyHigh >= week52Range.high >= dayRange.high
    expect(report.historyHigh).toBeGreaterThanOrEqual(report.week52Range.high);
    expect(report.week52Range.high).toBeGreaterThanOrEqual(report.dayRange.high);

    // Overnight gap and openToClose moves
    expect(report.overnightGap).toBe(
      Math.round((report.open - report.previousClose) * 100) / 100
    );
    expect(report.openToCloseChange).toBe(
      Math.round((report.close - report.open) * 100) / 100
    );

    // Multi-horizon returns & Moving Averages
    expect(report.periodReturns.map((r) => r.label)).toEqual([
      '1D',
      '1W',
      '1M',
      '3M',
      '1Y',
    ]);
    expect(report.movingAverages.length).toBe(3);
    expect(report.movingAverages[0]!.label).toBe('20D SMA');

    // Stock pulse present, ETF breadth null
    expect(report.stockPulse).not.toBeNull();
    expect(report.etfBreadth).toBeNull();

    if (report.stockPulse) {
      expect(report.stockPulse.lookbackDays).toBe(20);
      expect(
        report.stockPulse.upDaysCount +
          report.stockPulse.downDaysCount +
          report.stockPulse.flatDaysCount
      ).toBe(report.stockPulse.lookbackDays);
      expect(report.stockPulse.atr14).toBeGreaterThan(0);
      expect(report.stockPulse.todayRangeRatioVsAtr).toBeGreaterThan(0);
    }
  });

  it('builds a detailed report for an ETF (e.g. SPY) with constituent market breadth', () => {
    const dailyCandles = generateDailyCandles(25, 400);
    const mockQuotesByTicker: Record<string, TickerQuote> = {
      MSFT: {
        ticker: 'MSFT',
        price: 430,
        change: 4.5,
        changePercent: 1.05,
        high: 432,
        low: 425,
        open: 426,
        previousClose: 425.5,
        timestamp: 1729728000,
      },
    };

    const report = buildTickerDetailedReport(
      'SPY',
      dailyCandles,
      [],
      undefined,
      mockQuotesByTicker
    );

    expect(report).not.toBeNull();
    if (!report) return;

    expect(report.ticker).toBe('SPY');
    expect(report.instrumentType).toBe('etf');
    expect(report.name).toContain('SPDR S&P 500');

    // ETF breadth present, stock pulse null
    expect(report.etfBreadth).not.toBeNull();
    expect(report.stockPulse).toBeNull();

    if (report.etfBreadth) {
      expect(report.etfBreadth.totalCount).toBe(500);
      expect(
        report.etfBreadth.advancingCount +
          report.etfBreadth.decliningCount +
          report.etfBreadth.unchangedCount
      ).toBe(report.etfBreadth.totalCount);
      expect(report.etfBreadth.topHoldings.length).toBeGreaterThanOrEqual(3);

      const msftHolding = report.etfBreadth.topHoldings.find((h) => h.ticker === 'MSFT');
      expect(msftHolding).toBeDefined();
      expect(msftHolding?.changePercent).toBe(1.05); // Derived from provided mockQuotesByTicker
    }
  });
});

describe('Milestone 19: Clean De-Duplicated Split Panel & Reserved Lower News/Earnings Space', () => {
  it('renders clean 1D chart and de-duplicated right split panel with upper metrics and reserved lower half', () => {
    const dailyCandles = generateDailyCandles(25, 175);
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

    // Right Half Detailed Info Panel
    expect(html).toContain('data-testid="daily-1d-report-pane"');
    expect(html).toContain('data-testid="daily-1d-instrument-badge"');
    expect(html).toContain('STOCK');

    // De-Duplicated Upper Half Metrics
    expect(html).toContain('data-testid="split-panel-upper-metrics"');
    expect(html).toContain('data-testid="daily-1d-key-numbers-section"');
    expect(html).toContain('data-testid="daily-1d-report-open-card"');
    expect(html).toContain('data-testid="daily-1d-report-close-card"');
    expect(html).toContain('data-testid="daily-1d-open"');
    expect(html).toContain('data-testid="daily-1d-close"');
    expect(html).toContain('data-testid="daily-1d-prev-close"');
    expect(html).toContain('data-testid="daily-1d-change"');

    // Unified Range Rows (low & high together, no duplicate separate cards)
    expect(html).toContain('data-testid="daily-1d-low"');
    expect(html).toContain('data-testid="daily-1d-high"');
    expect(html).toContain('data-testid="daily-1d-report-52w-card"');
    expect(html).toContain('data-testid="daily-1d-report-history-high-card"');
    expect(html).toContain("Today&#x27;s Session Range");
    expect(html).toContain('52-Week Range');
    expect(html).toContain('Historical Range');

    // Trend & Stock Pulse Section
    expect(html).toContain('data-testid="daily-1d-horizon-trend-section"');
    expect(html).toContain('20D SMA');
    expect(html).toContain('data-testid="daily-1d-stock-pulse-section"');
    expect(html).toContain('data-testid="daily-1d-stock-up-days"');
    expect(html).toContain('data-testid="daily-1d-stock-down-days"');

    // Reserved Lower Half for Future News & Earnings Reports
    expect(html).toContain('data-testid="split-panel-lower-reserved"');
    expect(html).toContain('News &amp; Earnings Reports');
  });

  it('renders only the full-width chart when showSplitPanel is false', () => {
    const dailyCandles = generateDailyCandles(25, 175);

    const html = renderToStaticMarkup(
      createElement(DailySessionSplitView, {
        ticker: 'AAPL',
        dailyCandles,
        showSplitPanel: false,
      })
    );

    // Chart pane is present and full width
    expect(html).toContain('data-testid="daily-1d-chart-pane"');
    expect(html).toContain('flex-1');

    // Right split panel is NOT rendered
    expect(html).not.toContain('data-testid="daily-1d-report-pane"');
    expect(html).not.toContain('data-testid="split-panel-upper-metrics"');
  });

  it('renders StockDetailSplitPanel standalone with close button callback', () => {
    const dailyCandles = generateDailyCandles(25, 200);
    const handleClose = vi.fn();

    const html = renderToStaticMarkup(
      createElement(StockDetailSplitPanel, {
        ticker: 'NVDA',
        dailyCandles,
        onClose: handleClose,
      })
    );

    expect(html).toContain('data-testid="daily-1d-report-pane"');
    expect(html).toContain('NVDA');
    expect(html).toContain('data-testid="close-split-panel-btn"');
    expect(html).toContain('data-testid="split-panel-lower-reserved"');
  });

  it('renders toggle-split-panel-btn in TopHeaderBar and reflects aria-pressed state', () => {
    const handleToggle = vi.fn();

    // Split panel closed (default)
    const closedHtml = renderToStaticMarkup(
      createElement(TopHeaderBar, {
        activeTicker: 'AAPL',
        quote: undefined,
        providerId: 'demo',
        isLoading: false,
        isSplitPanelOpen: false,
        onToggleSplitPanel: handleToggle,
        onSelectTimeframe: vi.fn(),
        onRefresh: vi.fn(),
      })
    );

    expect(closedHtml).toContain('data-testid="toggle-split-panel-btn"');
    expect(closedHtml).toContain('aria-pressed="false"');
    expect(closedHtml).toContain('title="Toggle Stock Info Split Panel (i)"');

    // Split panel open
    const openHtml = renderToStaticMarkup(
      createElement(TopHeaderBar, {
        activeTicker: 'AAPL',
        quote: undefined,
        providerId: 'demo',
        isLoading: false,
        isSplitPanelOpen: true,
        onToggleSplitPanel: handleToggle,
        onSelectTimeframe: vi.fn(),
        onRefresh: vi.fn(),
      })
    );

    expect(openHtml).toContain('data-testid="toggle-split-panel-btn"');
    expect(openHtml).toContain('aria-pressed="true"');
  });

  it('renders ETF constituent market breadth and top holdings when viewing an ETF (SPY)', () => {
    const dailyCandles = generateDailyCandles(25, 450);

    const html = renderToStaticMarkup(
      createElement(DailySessionSplitView, {
        ticker: 'SPY',
        dailyCandles,
      })
    );

    expect(html).toContain('data-testid="daily-1d-report-pane"');
    expect(html).toContain('data-testid="daily-1d-instrument-badge"');
    expect(html).toContain('ETF');
    expect(html).toContain('data-testid="daily-1d-etf-breadth-section"');
    expect(html).toContain('data-testid="daily-1d-etf-up-count"');
    expect(html).toContain('data-testid="daily-1d-etf-down-count"');
    expect(html).toContain('data-testid="daily-1d-etf-top-holdings"');
    expect(html).toContain('S&amp;P 500 Constituents');
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
