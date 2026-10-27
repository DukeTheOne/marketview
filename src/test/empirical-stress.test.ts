import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  FibonacciPayloadSchema,
  LogicalAnchorSchema,
  type ChartAnnotation,
  type LogicalAnchor,
} from '../core/schemas/annotation';
import {
  calculateJournalSummary,
  calculateTradePnLPercent,
  calculateTradeRealizedPnL,
  type TradeEntry,
} from '../core/schemas/trade';
import {
  calculateFibonacciLevels,
  fibonacciPlugin,
} from '../features/chart/overlays/plugins/FibonacciPlugin';
import {
  JournalAnalyticsCard,
} from '../features/journal/JournalAnalyticsCard';

function makeTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  const ts = 1710000000;
  return {
    id: overrides.id ?? `trade-${Math.random().toString(36).substring(2, 9)}`,
    ticker: overrides.ticker ?? 'AAPL',
    side: overrides.side ?? 'BUY',
    status: overrides.status ?? 'CLOSED',
    entryTimestamp: overrides.entryTimestamp ?? ts,
    entryPrice: overrides.entryPrice ?? 100,
    quantity: overrides.quantity ?? 10,
    exitTimestamp: overrides.exitTimestamp ?? ts + 3600,
    exitPrice: overrides.exitPrice ?? 150,
    setupTags: overrides.setupTags ?? ['Breakout'],
    notesMarkdown: overrides.notesMarkdown ?? '',
    createdAt: overrides.createdAt ?? ts,
    updatedAt: overrides.updatedAt ?? ts,
    ...overrides,
  };
}

describe('Empirical Stress Harness: Fibonacci Retracement', () => {
  describe('Inverted swing extremes', () => {
    it('handles steep downtrend (high startPrice, low endPrice)', () => {
      const startPrice = 5000;
      const endPrice = 1;
      const levels = calculateFibonacciLevels(startPrice, endPrice);

      expect(levels).toHaveLength(7);
      expect(levels[0]?.price).toBe(5000); // 0%
      expect(levels[6]?.price).toBe(1); // 100%

      // In a downtrend, each higher ratio should produce a monotonically lower price
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]!.price).toBeLessThan(levels[i - 1]!.price);
      }
    });

    it('handles steep uptrend (micro penny startPrice, huge endPrice)', () => {
      const startPrice = 0.01;
      const endPrice = 50000;
      const levels = calculateFibonacciLevels(startPrice, endPrice);

      expect(levels[0]?.price).toBeCloseTo(0.01, 2);
      expect(levels[6]?.price).toBeCloseTo(50000, 2);

      // In an uptrend, each higher ratio should produce a monotonically higher price
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]!.price).toBeGreaterThan(levels[i - 1]!.price);
      }
    });

    it('renders FibonacciAnnotationComponent with reverse time ordering (anchor1.timestamp > anchor2.timestamp)', () => {
      const dummyProjector = {
        logicalToScreen: (a: LogicalAnchor) => ({
          x: a.timestamp === 2000 ? 500 : 100,
          y: a.price === 200 ? 50 : 250,
        }),
        screenToLogical: () => null,
      };

      const annotation: ChartAnnotation = {
        id: 'fib-reverse',
        ticker: 'TSLA',
        type: 'fibonacci',
        anchors: [
          { timestamp: 2000, price: 200 }, // Anchor 1 is further right in time
          { timestamp: 1000, price: 100 }, // Anchor 2 is further left
        ],
        payload: fibonacciPlugin.createDefaultPayload([]),
        createdAt: 1710000000,
        updatedAt: 1710000000,
      };

      const html = renderToStaticMarkup(
        fibonacciPlugin.renderAnnotation({
          annotation,
          payload: fibonacciPlugin.payloadSchema.parse(annotation.payload),
          isSelected: false,
          projector: dummyProjector,
          onSelect: () => {},
          onUpdate: () => {},
          onDelete: () => {},
        })
      );

      expect(html).toContain('<svg');
      expect(html).toContain('rect');
      // minX should be 100 and maxX should be 500 (since min(500, 100) = 100, max(500, 100) = 500)
      expect(html).toContain('x="100"');
      expect(html).toContain('width="400"');
    });
  });

  describe('Zero-delta flat prices', () => {
    it('calculates identical prices without division by zero when startPrice === endPrice', () => {
      const flatPrice = 123.45;
      const levels = calculateFibonacciLevels(flatPrice, flatPrice);

      expect(levels).toHaveLength(7);
      levels.forEach((lvl) => {
        expect(lvl.price).toBe(flatPrice);
      });
    });

    it('renders SVG bands with safe fallback height (1px) when prices are completely flat', () => {
      const dummyProjector = {
        logicalToScreen: () => ({ x: 150, y: 150 }),
        screenToLogical: () => null,
      };

      const annotation: ChartAnnotation = {
        id: 'fib-flat',
        ticker: 'FLAT',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1000, price: 150 },
          { timestamp: 2000, price: 150 },
        ],
        payload: fibonacciPlugin.createDefaultPayload([]),
        createdAt: 1710000000,
        updatedAt: 1710000000,
      };

      const html = renderToStaticMarkup(
        fibonacciPlugin.renderAnnotation({
          annotation,
          payload: fibonacciPlugin.payloadSchema.parse(annotation.payload),
          isSelected: false,
          projector: dummyProjector,
          onSelect: () => {},
          onUpdate: () => {},
          onDelete: () => {},
        })
      );

      expect(html).toContain('height="1"');
      expect(html).not.toContain('NaN');
    });
  });

  describe('Extreme precision values & Boundary ratios [0, 1]', () => {
    it('handles high fractional precision and formats clean labels', () => {
      const startPrice = 123.4567891;
      const endPrice = 987.6543219;
      const levels = calculateFibonacciLevels(startPrice, endPrice);

      expect(levels[0]?.price).toBe(startPrice);
      expect(levels[6]?.price).toBe(endPrice);

      levels.forEach((lvl) => {
        expect(Number.isFinite(lvl.price)).toBe(true);
        expect(lvl.label).toMatch(/^\d+\.\d%$/);
      });
    });

    it('validates boundary ratios 0.0 and 1.0 against strict schema', () => {
      const parsed = FibonacciPayloadSchema.safeParse({
        levels: [0, 1],
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.levels).toEqual([0, 1]);
      }
    });

    it('rejects invalid ratios (< 0 or > 2.0)', () => {
      const negativeRatio = FibonacciPayloadSchema.safeParse({
        levels: [-0.1, 0.5, 1],
      });
      expect(negativeRatio.success).toBe(false);

      const excessiveRatio = FibonacciPayloadSchema.safeParse({
        levels: [0, 0.5, 2.5],
      });
      expect(excessiveRatio.success).toBe(false);
    });
  });

  describe('Extension levels > 1.0', () => {
    it('supports 1.272, 1.618, and 2.0 extension levels', () => {
      const customRatios = [0, 0.5, 1, 1.272, 1.618, 2.0];
      const levels = calculateFibonacciLevels(100, 200, customRatios);

      expect(levels).toHaveLength(6);
      expect(levels[3]?.label).toBe('127.2%');
      expect(levels[3]?.price).toBeCloseTo(227.2, 1);
      expect(levels[4]?.label).toBe('161.8%');
      expect(levels[4]?.price).toBeCloseTo(261.8, 1);
      expect(levels[5]?.label).toBe('200.0%');
      expect(levels[5]?.price).toBe(300);
    });

    it('handles negative price projection in steep downtrend extensions via projector fallback', () => {
      // start = 10, end = 2 -> delta = -8. Ratio 1.618 -> 10 + (-8)*1.618 = -2.944
      const levels = calculateFibonacciLevels(10, 2, [0, 1, 1.618]);
      expect(levels[2]?.price).toBeLessThan(0);

      // Projector returns null for negative prices
      const dummyProjector = {
        logicalToScreen: (a: LogicalAnchor) => {
          if (a.price <= 0) return null;
          return { x: 100, y: 100 - a.price * 5 };
        },
        screenToLogical: () => null,
      };

      const annotation: ChartAnnotation = {
        id: 'fib-neg',
        ticker: 'DIP',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1000, price: 10 },
          { timestamp: 2000, price: 2 },
        ],
        payload: {
          color: '#a855f7',
          levels: [0, 1, 1.618],
          extendRight: false,
          showPrices: true,
          fillBackground: true,
        },
        createdAt: 1710000000,
        updatedAt: 1710000000,
      };

      const html = renderToStaticMarkup(
        fibonacciPlugin.renderAnnotation({
          annotation,
          payload: annotation.payload as any,
          isSelected: false,
          projector: dummyProjector,
          onSelect: () => {},
          onUpdate: () => {},
          onDelete: () => {},
        })
      );

      // Should render without throwing NaN, using the linear interpolation fallback
      expect(html).toContain('161.8%');
      expect(html).toContain('($-2.94)');
      expect(html).not.toContain('NaN');
    });
  });

  describe('Logical anchor constraints & Screen-to-logical', () => {
    it('enforces strictly positive price in LogicalAnchorSchema', () => {
      const validAnchor = LogicalAnchorSchema.safeParse({
        timestamp: 1710000000,
        price: 150.25,
      });
      expect(validAnchor.success).toBe(true);

      const zeroPrice = LogicalAnchorSchema.safeParse({
        timestamp: 1710000000,
        price: 0,
      });
      expect(zeroPrice.success).toBe(false);

      const negativePrice = LogicalAnchorSchema.safeParse({
        timestamp: 1710000000,
        price: -10,
      });
      expect(negativePrice.success).toBe(false);

      const nonIntegerTime = LogicalAnchorSchema.safeParse({
        timestamp: 1710000000.5,
        price: 100,
      });
      expect(nonIntegerTime.success).toBe(false);
    });

    it('validates dragging updates conform to 2-anchor schema requirement', () => {
      const anchor1: LogicalAnchor = { timestamp: 1710000000, price: 100 };
      const anchor2: LogicalAnchor = { timestamp: 1710003600, price: 200 };

      // Simulate dragging handle 0 to a new logical anchor
      const movedHandle0: [LogicalAnchor, LogicalAnchor] = [
        { timestamp: 1710001000, price: 120 },
        anchor2,
      ];
      expect(movedHandle0).toHaveLength(2);
      expect(LogicalAnchorSchema.safeParse(movedHandle0[0]).success).toBe(true);
      expect(LogicalAnchorSchema.safeParse(movedHandle0[1]).success).toBe(true);

      // Simulate dragging handle 1
      const movedHandle1: [LogicalAnchor, LogicalAnchor] = [
        anchor1,
        { timestamp: 1710005000, price: 250 },
      ];
      expect(movedHandle1).toHaveLength(2);
      expect(LogicalAnchorSchema.safeParse(movedHandle1[0]).success).toBe(true);
      expect(LogicalAnchorSchema.safeParse(movedHandle1[1]).success).toBe(true);
    });
  });
});

describe('Empirical Stress Harness: Journal Analytics', () => {
  describe('Large trade volume stress (hundreds of trades)', () => {
    it('efficiently aggregates 1,000 trades with zero stack overflow or precision drift', () => {
      const trades: TradeEntry[] = [];
      const startTime = 1700000000;

      for (let i = 0; i < 1000; i++) {
        const isWin = i % 3 !== 0; // ~66.7% win rate
        const entry = 100 + (i % 20);
        const exit = isWin ? entry + 5 : entry - 4;
        trades.push(
          makeTrade({
            id: `trade-vol-${i}`,
            ticker: i % 2 === 0 ? 'NVDA' : 'AAPL',
            entryPrice: entry,
            exitPrice: exit,
            quantity: 10,
            entryTimestamp: startTime + i * 100,
            exitTimestamp: startTime + i * 100 + 50,
            setupTags: [i % 2 === 0 ? 'Breakout' : 'Trend'],
          })
        );
      }

      const t0 = performance.now();
      const summary = calculateJournalSummary(trades);
      const t1 = performance.now();

      expect(t1 - t0).toBeLessThan(100); // Sub-100ms aggregation
      expect(summary.totalTrades).toBe(1000);
      expect(summary.closedTrades).toBe(1000);
      expect(summary.winCount + summary.lossCount).toBe(1000);

      // Render JournalAnalyticsCard with 1,000 trades
      const r0 = performance.now();
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades,
          summary,
        })
      );
      const r1 = performance.now();

      expect(r1 - r0).toBeLessThan(250); // Fast SVG rendering
      expect(html).toContain('1000 closed trades');
      expect(html).toContain('role="img"');
      expect(html).not.toContain('NaN');
    });

    it('stress tests Math.min / Math.max spread limit up to 5,000 trades', () => {
      const largeTrades: TradeEntry[] = [];
      for (let i = 0; i < 5000; i++) {
        largeTrades.push(
          makeTrade({
            id: `t-${i}`,
            entryPrice: 100,
            exitPrice: i % 2 === 0 ? 101 : 99,
            quantity: 1,
            setupTags: ['Scalp'],
          })
        );
      }
      const summary = calculateJournalSummary(largeTrades);
      expect(() => {
        renderToStaticMarkup(
          React.createElement(JournalAnalyticsCard, {
            trades: largeTrades,
            summary,
          })
        );
      }).not.toThrow();
    });
  });

  describe('Chronological reordering of out-of-order trades', () => {
    it('correctly sorts trades chronologically by exitTimestamp before plotting curve', () => {
      // Intentionally provide trades in reverse chronological order
      const trades = [
        makeTrade({
          id: 't-later',
          ticker: 'AAPL',
          entryTimestamp: 2000,
          exitTimestamp: 3000, // Should be second
          entryPrice: 100,
          exitPrice: 150,
          quantity: 10, // +$500
        }),
        makeTrade({
          id: 't-earlier',
          ticker: 'TSLA',
          entryTimestamp: 1000,
          exitTimestamp: 1500, // Should be first
          entryPrice: 200,
          exitPrice: 180,
          quantity: 10, // -$200
        }),
      ];
      const summary = calculateJournalSummary(trades);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades,
          summary,
        })
      );

      // Point 1 should be TSLA (-$200, cumulative -$200)
      // Point 2 should be AAPL (+$500, cumulative +$300)
      expect(html).toContain('#1 TSLA | Trade: -$200.00 | Cumulative: -$200.00');
      expect(html).toContain('#2 AAPL | Trade: +$500.00 | Cumulative: +$300.00');
    });
  });

  describe('Multi-tag setup attribution', () => {
    it('attributes win and net PnL across all assigned tags on a single trade', () => {
      const multiTagTrade = makeTrade({
        setupTags: ['Breakout', 'GapUp', 'HighVolume'],
        entryPrice: 100,
        exitPrice: 120,
        quantity: 10, // +$200
      });
      const summary = calculateJournalSummary([multiTagTrade]);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: [multiTagTrade],
          summary,
        })
      );

      expect(html).toContain('Breakout');
      expect(html).toContain('GapUp');
      expect(html).toContain('HighVolume');

      // Each tag should show +$200.00
      const matches = html.match(/\+\$200\.00/g);
      expect(matches?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Single-trade win/loss edge cases', () => {
    it('handles solitary single winning trade', () => {
      const singleWin = [
        makeTrade({
          id: 'single-win',
          entryPrice: 50,
          exitPrice: 75,
          quantity: 20, // PnL = +$500.00
          setupTags: ['Flag'],
        }),
      ];
      const summary = calculateJournalSummary(singleWin);
      expect(summary.winCount).toBe(1);
      expect(summary.lossCount).toBe(0);
      expect(summary.winRatePercent).toBe(100);
      expect(summary.profitFactor).toBe(99.99);
      expect(summary.totalRealizedPnL).toBe(500);

      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: singleWin,
          summary,
        })
      );
      expect(html).toContain('1 closed trade');
      expect(html).toContain('+$500.00');
      expect(html).toContain('id="equityCurveEmeraldGrad"');
      expect(html).toContain('Best Win');
      expect(html).toContain('Worst Loss');
      expect(html).toContain('$0.00'); // No loss, worst loss is $0.00
    });

    it('handles solitary single losing trade', () => {
      const singleLoss = [
        makeTrade({
          id: 'single-loss',
          entryPrice: 100,
          exitPrice: 80,
          quantity: 10, // PnL = -$200.00
          setupTags: ['Dip'],
        }),
      ];
      const summary = calculateJournalSummary(singleLoss);
      expect(summary.winCount).toBe(0);
      expect(summary.lossCount).toBe(1);
      expect(summary.winRatePercent).toBe(0);
      expect(summary.profitFactor).toBe(0);
      expect(summary.totalRealizedPnL).toBe(-200);

      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: singleLoss,
          summary,
        })
      );
      expect(html).toContain('1 closed trade');
      expect(html).toContain('-$200.00');
      expect(html).toContain('id="equityCurveRoseGrad"');
      expect(html).toContain('$0.00'); // Best win is $0.00
    });

    it('handles solitary scratch trade (PnL === $0.00)', () => {
      const scratchTrade = [
        makeTrade({
          id: 'scratch',
          entryPrice: 100,
          exitPrice: 100,
          quantity: 50, // PnL = $0.00
        }),
      ];
      const summary = calculateJournalSummary(scratchTrade);
      expect(summary.winCount).toBe(0);
      expect(summary.lossCount).toBe(0);
      expect(summary.winRatePercent).toBe(0);
      expect(summary.profitFactor).toBe(0);
      expect(summary.totalRealizedPnL).toBe(0);

      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: scratchTrade,
          summary,
        })
      );
      expect(html).toContain('1 closed trade');
      expect(html).toContain('$0.00');
      // valSpan is 0; baseline zeroY should fall back cleanly without NaN
      expect(html).not.toContain('NaN');
    });
  });

  describe('Zero-trade and all-OPEN empty states', () => {
    it('renders empty prompt when trade list is empty', () => {
      const summary = calculateJournalSummary([]);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: [],
          summary,
        })
      );
      expect(html).toContain('0 closed trades');
      expect(html).toContain(
        'Close at least 1 position to render your chronological P&amp;L equity curve.'
      );
      expect(html).not.toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
    });

    it('renders empty prompt when all trades are OPEN', () => {
      const openTrades = [
        makeTrade({ status: 'OPEN', exitPrice: undefined }),
        makeTrade({ status: 'OPEN', exitPrice: undefined }),
      ];
      const summary = calculateJournalSummary(openTrades);
      expect(summary.openTrades).toBe(2);
      expect(summary.closedTrades).toBe(0);

      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: openTrades,
          summary,
        })
      );
      expect(html).toContain('0 closed trades');
      expect(html).not.toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
    });
  });

  describe('All-win and all-loss portfolios', () => {
    it('calculates 100% win rate and 99.99 profitFactor on all-win portfolio', () => {
      const allWins = [
        makeTrade({ entryPrice: 10, exitPrice: 15, quantity: 10 }), // +50
        makeTrade({ entryPrice: 20, exitPrice: 25, quantity: 10 }), // +50
        makeTrade({ entryPrice: 30, exitPrice: 40, quantity: 10 }), // +100
      ];
      const summary = calculateJournalSummary(allWins);
      expect(summary.winRatePercent).toBe(100);
      expect(summary.profitFactor).toBe(99.99);
      expect(summary.averageLoss).toBe(0);
      expect(summary.averageWin).toBe(66.67);
    });

    it('calculates 0% win rate and 0 profitFactor on all-loss portfolio', () => {
      const allLosses = [
        makeTrade({ entryPrice: 15, exitPrice: 10, quantity: 10 }), // -50
        makeTrade({ entryPrice: 25, exitPrice: 20, quantity: 10 }), // -50
      ];
      const summary = calculateJournalSummary(allLosses);
      expect(summary.winRatePercent).toBe(0);
      expect(summary.profitFactor).toBe(0);
      expect(summary.averageWin).toBe(0);
      expect(summary.averageLoss).toBe(50);
    });
  });

  describe('Untagged trades & Setup tag tie-breaking', () => {
    it('groups empty tags and whitespace tags under "Untagged"', () => {
      const trades = [
        makeTrade({ setupTags: [], entryPrice: 100, exitPrice: 110, quantity: 5 }), // +$50 Untagged
        makeTrade({ setupTags: ['   '], entryPrice: 100, exitPrice: 105, quantity: 5 }), // +$25 Untagged
      ];
      const summary = calculateJournalSummary(trades);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades,
          summary,
        })
      );
      expect(html).toContain('Untagged');
      expect(html).toContain('2 trades');
      expect(html).toContain('+$75.00');
    });

    it('preserves deterministic ranking when tags have identical net PnL (tie-breaking)', () => {
      const trades = [
        makeTrade({ setupTags: ['Setup Alpha'], entryPrice: 100, exitPrice: 120, quantity: 5 }), // +$100
        makeTrade({ setupTags: ['Setup Beta'], entryPrice: 100, exitPrice: 120, quantity: 5 }), // +$100
        makeTrade({ setupTags: ['Setup Gamma'], entryPrice: 100, exitPrice: 80, quantity: 5 }), // -$100
        makeTrade({ setupTags: ['Setup Delta'], entryPrice: 100, exitPrice: 80, quantity: 5 }), // -$100
      ];
      const summary = calculateJournalSummary(trades);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades,
          summary,
        })
      );

      const posAlpha = html.indexOf('Setup Alpha');
      const posBeta = html.indexOf('Setup Beta');
      const posGamma = html.indexOf('Setup Gamma');
      const posDelta = html.indexOf('Setup Delta');

      // Both Alpha & Beta (+100) must rank before Gamma & Delta (-100)
      expect(posAlpha).toBeLessThan(posGamma);
      expect(posBeta).toBeLessThan(posGamma);
      expect(posAlpha).toBeLessThan(posDelta);
      expect(posBeta).toBeLessThan(posDelta);
    });
  });

  describe('P&L precision and rounding accuracy', () => {
    it('correctly rounds fractional penny multiplication without IEEE 754 drift', () => {
      // 33 shares @ $10.03 -> $10.06 = $0.03 * 33 = 0.9900000000000009
      const trickyTrade = makeTrade({
        quantity: 33,
        entryPrice: 10.03,
        exitPrice: 10.06,
      });
      const pnl = calculateTradeRealizedPnL(trickyTrade);
      expect(pnl).toBe(0.99);

      const pnlPct = calculateTradePnLPercent(trickyTrade);
      // (10.06 - 10.03)/10.03 * 100 = 0.2991026919242273 -> 0.3%
      expect(pnlPct).toBe(0.3);
    });

    it('prevents cumulative drift over 100 tiny fractional trades', () => {
      const microTrades: TradeEntry[] = [];
      for (let i = 0; i < 100; i++) {
        microTrades.push(
          makeTrade({
            id: `micro-${i}`,
            quantity: 3,
            entryPrice: 10.01,
            exitPrice: 10.04, // (0.03 * 3) = 0.09
          })
        );
      }
      const summary = calculateJournalSummary(microTrades);
      // 100 trades * 0.09 = 9.00 exactly
      expect(summary.totalRealizedPnL).toBe(9.0);
    });
  });
});
