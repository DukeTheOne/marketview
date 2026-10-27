import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  calculateJournalSummary,
  type JournalSummary,
  type TradeEntry,
} from '../../../core/schemas/trade';
import { JournalAnalyticsCard } from '../JournalAnalyticsCard';
import { TradeJournalDrawer, type TradeJournalDrawerProps } from '../TradeJournalDrawer';

function createDummyTrade(overrides: Partial<TradeEntry>): TradeEntry {
  const now = 1700000000;
  return {
    id: overrides.id ?? 'trade-1',
    ticker: overrides.ticker ?? 'AAPL',
    side: overrides.side ?? 'BUY',
    status: overrides.status ?? 'CLOSED',
    entryTimestamp: overrides.entryTimestamp ?? now,
    entryPrice: overrides.entryPrice ?? 100,
    quantity: overrides.quantity ?? 10,
    exitTimestamp: overrides.exitTimestamp ?? now + 3600,
    exitPrice: overrides.exitPrice ?? 150,
    setupTags: overrides.setupTags ?? ['Breakout'],
    notesMarkdown: overrides.notesMarkdown ?? '',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  };
}

describe('JournalAnalyticsCard Unit Tests', () => {
  it('renders empty state correctly when closed trades < 1 (empty trade array)', () => {
    const summary = calculateJournalSummary([]);
    const html = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: [],
        summary,
      })
    );

    // Section title & badge
    expect(html).toContain('Edge Analytics &amp; Setup Attribution');
    expect(html).toContain('0 closed trades');

    // Empty state curve notice
    expect(html).toContain(
      'Close at least 1 position to render your chronological P&amp;L equity curve.'
    );

    // Default zero metrics
    expect(html).toContain('$0.00');
    expect(html).toContain('/trade');

    // Empty state tag notice
    expect(html).toContain(
      'Tag your trade executions (e.g. Breakout, Retest) and close positions to rank setup performance.'
    );

    // SVG chart should NOT be rendered in empty state
    expect(html).not.toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
  });

  it('renders empty state correctly when all trades are OPEN', () => {
    const openTrades: TradeEntry[] = [
      createDummyTrade({
        id: 'open-1',
        ticker: 'MSFT',
        status: 'OPEN',
        exitPrice: undefined,
        exitTimestamp: undefined,
      }),
      createDummyTrade({
        id: 'open-2',
        ticker: 'NVDA',
        status: 'OPEN',
        exitPrice: undefined,
        exitTimestamp: undefined,
      }),
    ];
    const summary = calculateJournalSummary(openTrades);
    const html = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: openTrades,
        summary,
      })
    );

    expect(html).toContain('0 closed trades');
    expect(html).toContain(
      'Close at least 1 position to render your chronological P&amp;L equity curve.'
    );
    expect(html).not.toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
  });

  it('renders positive equity curve, best win, worst loss, and expectancy correctly with closed trades', () => {
    const trades: TradeEntry[] = [
      createDummyTrade({
        id: 't-1',
        ticker: 'AAPL',
        side: 'BUY',
        status: 'CLOSED',
        entryTimestamp: 1000,
        exitTimestamp: 2000,
        entryPrice: 100,
        exitPrice: 150,
        quantity: 10, // PnL = +$500
        setupTags: ['Breakout'],
      }),
      createDummyTrade({
        id: 't-2',
        ticker: 'TSLA',
        side: 'SHORT',
        status: 'CLOSED',
        entryTimestamp: 3000,
        exitTimestamp: 4000,
        entryPrice: 200,
        exitPrice: 220,
        quantity: 10, // PnL = -$200
        setupTags: ['Reversal'],
      }),
      createDummyTrade({
        id: 't-3',
        ticker: 'NVDA',
        side: 'BUY',
        status: 'CLOSED',
        entryTimestamp: 5000,
        exitTimestamp: 6000,
        entryPrice: 100,
        exitPrice: 130,
        quantity: 10, // PnL = +$300
        setupTags: ['Breakout'],
      }),
    ];

    const summary = calculateJournalSummary(trades);
    const html = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades,
        summary,
      })
    );

    // Header badge
    expect(html).toContain('3 closed trades');

    // SVG chart presence with positive emerald gradient
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
    expect(html).toContain('id="equityCurveEmeraldGrad"');
    expect(html).toContain('points=');

    // Key metrics
    // Cumulative PnL: +500 - 200 + 300 = +$600.00
    expect(html).toContain('+$600.00');

    // Best win: +$500.00
    expect(html).toContain('Best Win');
    expect(html).toContain('+$500.00');

    // Worst loss: -$200.00
    expect(html).toContain('Worst Loss');
    expect(html).toContain('-$200.00');

    // Expectancy calculation:
    // winRate = 2/3 = 66.7% = 0.667
    // averageWin = (500 + 300)/2 = 400
    // averageLoss = 200
    // expectancy = 0.667 * 400 - (1 - 0.667) * 200 = 266.8 - 66.6 = 200.2
    expect(html).toContain('Expectancy / Trade');
    expect(html).toContain('/trade');

    // Point titles in SVG
    expect(html).toContain('#1 AAPL | Trade: +$500.00 | Cumulative: +$500.00');
    expect(html).toContain('#2 TSLA | Trade: -$200.00 | Cumulative: +$300.00');
    expect(html).toContain('#3 NVDA | Trade: +$300.00 | Cumulative: +$600.00');
  });

  it('renders negative equity curve correctly with rose gradient', () => {
    const losingTrades: TradeEntry[] = [
      createDummyTrade({
        id: 'loss-1',
        ticker: 'AMD',
        side: 'BUY',
        status: 'CLOSED',
        entryPrice: 120,
        exitPrice: 100,
        quantity: 15, // PnL = -$300
        setupTags: ['Dip Buy'],
      }),
    ];

    const summary = calculateJournalSummary(losingTrades);
    const html = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: losingTrades,
        summary,
      })
    );

    expect(html).toContain('1 closed trade');
    expect(html).toContain('id="equityCurveRoseGrad"');
    expect(html).toContain('-$300.00');
    expect(html).toContain('$0.00'); // Best win is 0
  });

  it('calculates setup tag breakdown attribution rankings and win rates', () => {
    const trades: TradeEntry[] = [
      createDummyTrade({
        id: 't-1',
        ticker: 'AAPL',
        entryPrice: 100,
        exitPrice: 150,
        quantity: 10, // +$500
        setupTags: ['Breakout'],
      }),
      createDummyTrade({
        id: 't-2',
        ticker: 'MSFT',
        entryPrice: 200,
        exitPrice: 220,
        quantity: 10, // +$200
        setupTags: ['Breakout'],
      }),
      createDummyTrade({
        id: 't-3',
        ticker: 'TSLA',
        entryPrice: 150,
        exitPrice: 140,
        quantity: 10, // -$100
        setupTags: ['Retest'],
      }),
      createDummyTrade({
        id: 't-4',
        ticker: 'AMZN',
        entryPrice: 100,
        exitPrice: 90,
        quantity: 20, // -$200
        setupTags: ['Dip Buy'],
      }),
    ];

    const summary = calculateJournalSummary(trades);
    const html = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades,
        summary,
      })
    );

    // Verify tag breakdown items
    expect(html).toContain('Breakout');
    expect(html).toContain('Retest');
    expect(html).toContain('Dip Buy');

    // Breakout has 2 trades, 2 wins -> 100% win rate, net PnL +$700.00
    expect(html).toContain('100%');
    expect(html).toContain('+$700.00');

    // Retest has 1 trade, 0 wins -> 0% win rate, net PnL -$100.00
    expect(html).toContain('-$100.00');

    // Dip Buy has 1 trade, 0 wins -> 0% win rate, net PnL -$200.00
    expect(html).toContain('-$200.00');

    // Ranking order: Breakout (+700) should appear before Retest (-100), which appears before Dip Buy (-200)
    const breakoutPos = html.indexOf('Breakout');
    const retestPos = html.indexOf('Retest');
    const dipBuyPos = html.indexOf('Dip Buy');
    expect(breakoutPos).toBeLessThan(retestPos);
    expect(retestPos).toBeLessThan(dipBuyPos);
  });

  it('handles untagged trades correctly falling back to Untagged label', () => {
    const untaggedTrade = createDummyTrade({
      id: 'untagged-1',
      ticker: 'SPY',
      entryPrice: 400,
      exitPrice: 420,
      quantity: 5, // +$100
      setupTags: [],
    });

    const summary = calculateJournalSummary([untaggedTrade]);
    const html = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: [untaggedTrade],
        summary,
      })
    );

    expect(html).toContain('Untagged');
    expect(html).toContain('+$100.00');
    expect(html).toContain('100%');
  });
});

describe('TradeJournalDrawer Integration Tests', () => {
  const defaultDrawerProps: TradeJournalDrawerProps = {
    isOpen: true,
    activeTicker: 'AAPL',
    currentTickerPrice: 150,
    trades: [],
    summary: {
      totalTrades: 0,
      openTrades: 0,
      closedTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRatePercent: 0,
      totalRealizedPnL: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
    },
    filterStatus: 'ALL',
    onClose: () => {},
    onFilterChange: () => {},
    onLogTrade: async () => {},
    onClosePosition: async () => {},
    onDeleteTrade: async () => {},
    onSelectTicker: () => {},
  };

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(TradeJournalDrawer, {
        ...defaultDrawerProps,
        isOpen: false,
      })
    );
    expect(html).toBe('');
  });

  it('embeds JournalAnalyticsCard inside TradeJournalDrawer when isOpen is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(TradeJournalDrawer, {
        ...defaultDrawerProps,
        isOpen: true,
      })
    );

    // Main Drawer Header
    expect(html).toContain('Trade Execution Journal &amp; Portfolio Analytics');

    // KPI Stats Bar
    expect(html).toContain('Realized P&amp;L');
    expect(html).toContain('Win Rate');
    expect(html).toContain('Profit Factor');

    // Embedded JournalAnalyticsCard
    expect(html).toContain('Edge Analytics &amp; Setup Attribution');
    expect(html).toContain('0 closed trades');
    expect(html).toContain('Hide Analytics');

    // Main Drawer Body Form & Table
    expect(html).toContain('Log Execution');
    expect(html).toContain('Record Trade');
    expect(html).toContain('Symbol');

    // Check DOM hierarchy / order:
    // 1. KPI Stats Bar
    // 2. JournalAnalyticsCard
    // 3. Main Drawer Body
    const kpiPos = html.indexOf('Realized P&amp;L');
    const analyticsPos = html.indexOf('Edge Analytics &amp; Setup Attribution');
    const executionPos = html.indexOf('Log Execution');

    expect(kpiPos).toBeGreaterThan(-1);
    expect(analyticsPos).toBeGreaterThan(kpiPos);
    expect(executionPos).toBeGreaterThan(analyticsPos);
  });

  it('passes live trades and summary to embedded JournalAnalyticsCard within TradeJournalDrawer', () => {
    const sampleTrades: TradeEntry[] = [
      createDummyTrade({
        id: 'trade-live-1',
        ticker: 'NVDA',
        entryPrice: 100,
        exitPrice: 150,
        quantity: 10,
        setupTags: ['Momentum'],
      }),
    ];
    const liveSummary: JournalSummary = calculateJournalSummary(sampleTrades);

    const html = renderToStaticMarkup(
      React.createElement(TradeJournalDrawer, {
        ...defaultDrawerProps,
        isOpen: true,
        trades: sampleTrades,
        summary: liveSummary,
      })
    );

    // Live analytics card contents
    expect(html).toContain('1 closed trade');
    expect(html).toContain('Cumulative Realized Equity Curve');
    expect(html).toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
    expect(html).toContain('+$500.00');
    expect(html).toContain('Momentum');
  });
});
