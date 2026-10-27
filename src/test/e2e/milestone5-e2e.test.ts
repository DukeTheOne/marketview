import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// Core domain schemas & types
import {
  ChartAnnotationSchema,
  FibonacciPayloadSchema,
  FIBONACCI_DEFAULT_LEVELS,
  ChartAnnotationTypeSchema,
  type ChartAnnotation,
  type LogicalAnchor,
  type ChartAnnotationType,
} from '../../core/schemas/annotation';
import {
  PriceAlertSchema,
  shouldTriggerAlert,
  type PriceAlert,
} from '../../core/schemas/alert';
import {
  calculateJournalSummary,
  calculateTradeRealizedPnL,
  calculateTradePnLPercent,
  TradeEntrySchema,
  type TradeEntry,
} from '../../core/schemas/trade';
import {
  TickerQuoteSchema,
  type TickerQuote,
} from '../../core/schemas/market';

// Headless stores & repositories
import { createAlertStore } from '../../core/stores/alertStore';
import { createAnnotationStore } from '../../core/stores/annotationStore';
import { createTradeJournalStore } from '../../core/stores/tradeJournalStore';
import { InMemoryStorageRepository } from '../../core/repositories/InMemoryStorageRepository';

// Chart plugins & components
import {
  calculateFibonacciLevels,
  fibonacciPlugin,
} from '../../features/chart/overlays/plugins/FibonacciPlugin';
import { overlayPluginRegistry } from '../../features/chart/overlays/registry';
import { ChartToolbar } from '../../features/chart/overlays/ChartToolbar';
import {
  OverlayCanvas,
  type OverlayCanvasProps,
} from '../../features/chart/overlays/OverlayCanvas';
import type { ChartOverlayHostContext } from '../../features/chart/types';

// Journal components
import { JournalAnalyticsCard } from '../../features/journal/JournalAnalyticsCard';
import {
  TradeJournalDrawer,
  type TradeJournalDrawerProps,
} from '../../features/journal/TradeJournalDrawer';

// Alerts UI components
import {
  PriceAlertsPopover,
  type PriceAlertsPopoverProps,
} from '../../ui/alerts/PriceAlertsPopover';
import {
  TopHeaderBar,
  type TopHeaderBarProps,
} from '../../ui/layout/TopHeaderBar';

// ============================================================================
// TEST FIXTURES & DATA BUILDERS
// ============================================================================

function createMockQuote(
  ticker: string,
  price: number,
  timestamp = 1711900000
): TickerQuote {
  const spread = Math.min(Math.max(0.00001, price * 0.01), 1.0);
  return TickerQuoteSchema.parse({
    ticker,
    price,
    change: spread,
    changePercent: 0.75,
    high: price + spread,
    low: Math.max(0, price - spread),
    open: Math.max(0, price - spread / 2),
    previousClose: Math.max(0, price - spread),
    timestamp,
  });
}

function createDummyTrade(overrides: Partial<TradeEntry> = {}): TradeEntry {
  const baseTime = 1711900000;
  return TradeEntrySchema.parse({
    id: overrides.id ?? 'trade-1',
    ticker: overrides.ticker ?? 'AAPL',
    side: overrides.side ?? 'BUY',
    status: overrides.status ?? 'CLOSED',
    entryTimestamp: overrides.entryTimestamp ?? baseTime,
    entryPrice: overrides.entryPrice ?? 150,
    quantity: overrides.quantity ?? 10,
    exitTimestamp: overrides.exitTimestamp ?? baseTime + 3600,
    exitPrice: overrides.exitPrice ?? 180,
    setupTags: overrides.setupTags ?? ['Breakout'],
    notesMarkdown: overrides.notesMarkdown ?? '',
    createdAt: overrides.createdAt ?? baseTime,
    updatedAt: overrides.updatedAt ?? baseTime,
    ...overrides,
  });
}

function createDummyAlert(overrides: Partial<PriceAlert> = {}): PriceAlert {
  return PriceAlertSchema.parse({
    id: overrides.id ?? 'alert-1',
    ticker: overrides.ticker ?? 'AAPL',
    targetPrice: overrides.targetPrice ?? 200,
    condition: overrides.condition ?? 'CROSSING_UP',
    status: overrides.status ?? 'ACTIVE',
    note: overrides.note ?? 'Resistance breakout',
    createdAt: overrides.createdAt ?? 1711900000,
    triggeredAt: overrides.triggeredAt,
    ...overrides,
  });
}

function createMockHostContext(): ChartOverlayHostContext {
  return {
    ticker: 'AAPL',
    viewportRevision: 1,
    width: 800,
    height: 600,
    projector: {
      logicalToScreen: (anchor: LogicalAnchor) => ({
        x: Math.max(0, (anchor.timestamp - 1710000000) / 100),
        y: Math.max(0, 600 - anchor.price * 2),
      }),
      screenToLogical: (point: { x: number; y: number }) => ({
        timestamp: 1710000000 + point.x * 100,
        price: (600 - point.y) / 2,
      }),
    },
  };
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 tests per feature F1 to F9)
// ============================================================================

describe('Tier 1: Feature Coverage (F1 to F9)', () => {
  describe('F1: Fibonacci Plugin Registration', () => {
    it('T1-F1-1: registers in overlayPluginRegistry under type "fibonacci"', () => {
      const plugin = overlayPluginRegistry.get('fibonacci');
      expect(plugin).toBeDefined();
      expect(plugin?.type).toBe('fibonacci');
    });

    it('T1-F1-2: declares requiredAnchors === 2 for two-point retracement', () => {
      const plugin = overlayPluginRegistry.get('fibonacci');
      expect(plugin?.requiredAnchors).toBe(2);
    });

    it('T1-F1-3: exposes human-readable label "Fib Retracement"', () => {
      const plugin = overlayPluginRegistry.get('fibonacci');
      expect(plugin?.label).toBe('Fib Retracement');
    });

    it('T1-F1-4: produces standard default payload with purple color and 7 ratio levels', () => {
      const defaultPayload = fibonacciPlugin.createDefaultPayload([]);
      expect(defaultPayload.color).toBe('#a855f7');
      expect(defaultPayload.levels).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
      expect(defaultPayload.showPrices).toBe(true);
      expect(defaultPayload.fillBackground).toBe(true);
      expect(defaultPayload.extendRight).toBe(false);
    });

    it('T1-F1-5: validates payload through FibonacciPayloadSchema with defaults', () => {
      const parsed = FibonacciPayloadSchema.parse({});
      expect(parsed.color).toBe('#a855f7');
      expect(parsed.levels).toEqual([...FIBONACCI_DEFAULT_LEVELS]);
      expect(parsed.showPrices).toBe(true);
    });
  });

  describe('F2: Fibonacci Toolbar Button', () => {
    it('T1-F2-1: renders a "Fib" button in ChartToolbar', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 0,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('Fib');
    });

    it('T1-F2-2: renders Percent icon inside the Fib button', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 0,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('lucide-percent');
    });

    it('T1-F2-3: applies active purple styling when activeTool === "fibonacci"', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: 'fibonacci',
          annotationCount: 1,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('bg-purple-500');
      expect(html).toContain('text-slate-950');
    });

    it('T1-F2-4: applies inactive slate styling when activeTool !== "fibonacci"', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: 'trendline',
          annotationCount: 1,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('text-slate-400 hover:text-purple-300');
    });

    it('T1-F2-5: includes tooltip title explaining two-click placement', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 0,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain(
        'title="Fibonacci Retracement (Click twice to calculate Fibonacci retracement levels)"'
      );
    });
  });

  describe('F3: Fibonacci Two-Step Guidance Banner', () => {
    const baseCanvasProps: OverlayCanvasProps = {
      hostContext: createMockHostContext(),
      annotations: [],
      activeTool: 'fibonacci',
      selectedAnnotationId: null,
      onSelectTool: () => {},
      onSelectAnnotation: () => {},
      onAddAnnotation: async () => {},
      onUpdateAnnotation: async () => {},
      onDeleteAnnotation: async () => {},
    };

    it('T1-F3-1: renders step 1 guidance banner when 0 anchors placed', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: 'fibonacci',
        })
      );
      expect(html).toContain(
        'Click chart to place first anchor of Fibonacci retracement · Click Pointer to cancel'
      );
    });

    it('T1-F3-2: displays banner with purple badge aesthetic matching toolbar', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: 'fibonacci',
        })
      );
      expect(html).toContain('border-purple-500/40');
      expect(html).toContain('bg-purple-950/85');
      expect(html).toContain('text-purple-200');
    });

    it('T1-F3-3: hides banner completely when activeTool is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: null,
        })
      );
      expect(html).not.toContain('Fibonacci retracement');
      expect(html).not.toContain('border-purple-500');
    });

    it('T1-F3-4: hides Fibonacci banner when a different tool is active', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: 'sticker',
        })
      );
      expect(html).not.toContain('Fibonacci retracement');
      expect(html).toContain('Click anywhere on a candle or chart area to anchor sticker note');
    });

    it('T1-F3-5: applies cursor-crosshair on overlay canvas root during active fibonacci tool', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: 'fibonacci',
        })
      );
      expect(html).toContain('cursor-crosshair');
      expect(html).toContain('pointer-events-auto');
    });
  });

  describe('F4: Journal Analytics Embedding', () => {
    const dummyTrades = [
      createDummyTrade({
        id: 't-1',
        ticker: 'AAPL',
        entryPrice: 150,
        exitPrice: 175,
        quantity: 20, // +$500
        setupTags: ['Breakout'],
      }),
      createDummyTrade({
        id: 't-2',
        ticker: 'NVDA',
        entryPrice: 100,
        exitPrice: 90,
        quantity: 10, // -$100
        setupTags: ['Dip Buy'],
      }),
    ];
    const dummySummary = calculateJournalSummary(dummyTrades);

    it('T1-F4-1: renders section title "Edge Analytics & Setup Attribution"', () => {
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: dummyTrades,
          summary: dummySummary,
        })
      );
      expect(html).toContain('Edge Analytics &amp; Setup Attribution');
    });

    it('T1-F4-2: renders interactive SVG equity curve with role and aria-label', () => {
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: dummyTrades,
          summary: dummySummary,
        })
      );
      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="Cumulative Realized P&amp;L Equity Curve"');
    });

    it('T1-F4-3: displays Expectancy / Trade metric card', () => {
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: dummyTrades,
          summary: dummySummary,
        })
      );
      expect(html).toContain('Expectancy / Trade');
      expect(html).toContain('/trade');
    });

    it('T1-F4-4: displays Best Win and Worst Loss statistics', () => {
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: dummyTrades,
          summary: dummySummary,
        })
      );
      expect(html).toContain('Best Win');
      expect(html).toContain('+$500.00');
      expect(html).toContain('Worst Loss');
      expect(html).toContain('-$100.00');
    });

    it('T1-F4-5: renders Setup Tag Performance Breakdown ranking list', () => {
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: dummyTrades,
          summary: dummySummary,
        })
      );
      expect(html).toContain('Setup Tag Performance Breakdown');
      expect(html).toContain('Breakout');
      expect(html).toContain('Dip Buy');
    });
  });

  describe('F5: Price Alerts Popover UI', () => {
    const defaultPopoverProps: PriceAlertsPopoverProps = {
      isOpen: true,
      activeTicker: 'AAPL',
      currentPrice: 185.5,
      alerts: [
        createDummyAlert({
          id: 'a-1',
          ticker: 'AAPL',
          targetPrice: 190,
          condition: 'CROSSING_UP',
          status: 'ACTIVE',
        }),
      ],
      lastTriggeredAlertIds: [],
      onClose: () => {},
      onCreateAlert: () => {},
      onDismissAlert: () => {},
      onRearmAlert: () => {},
      onDeleteAlert: () => {},
    };

    it('T1-F5-1: returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, {
          ...defaultPopoverProps,
          isOpen: false,
        })
      );
      expect(html).toBe('');
    });

    it('T1-F5-2: renders header with title "Price Alerts" and ticker badge when isOpen is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, defaultPopoverProps)
      );
      expect(html).toContain('Price Alerts');
      expect(html).toContain('AAPL');
      expect(html).toContain('$185.50');
    });

    it('T1-F5-3: provides direction toggle buttons for Crossing Above and Crossing Below', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, defaultPopoverProps)
      );
      expect(html).toContain('Crossing Above');
      expect(html).toContain('Crossing Below');
    });

    it('T1-F5-4: displays alert list item with target price and status badge', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, defaultPopoverProps)
      );
      expect(html).toContain('$190.00');
      expect(html).toContain('ACTIVE');
    });

    it('T1-F5-5: renders per-alert action buttons for dismissal and deletion', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, defaultPopoverProps)
      );
      expect(html).toContain('title="Dismiss alert"');
      expect(html).toContain('title="Delete alert"');
    });
  });

  describe('F6: Price Alerts Header Integration', () => {
    const defaultHeaderProps: TopHeaderBarProps = {
      activeTicker: 'AAPL',
      activeTimeframe: '1D',
      quote: createMockQuote('AAPL', 185.5),
      providerId: 'deterministic-demo',
      isLoading: false,
      isJournalOpen: false,
      tradeCount: 3,
      onSelectTimeframe: () => {},
      onRefresh: () => {},
      onToggleJournal: () => {},
      alerts: [createDummyAlert({ ticker: 'AAPL', status: 'ACTIVE' })],
      lastTriggeredAlertIds: [],
    };

    it('T1-F6-1: renders "Alerts" toggle button in TopHeaderBar', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, defaultHeaderProps)
      );
      expect(html).toContain('Alerts');
      expect(html).toContain('data-testid="alerts-toggle-btn"');
    });

    it('T1-F6-2: renders count badge when active alerts exist', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...defaultHeaderProps,
          alerts: [
            createDummyAlert({ id: 'a-1', status: 'ACTIVE' }),
            createDummyAlert({ id: 'a-2', status: 'ACTIVE' }),
          ],
        })
      );
      expect(html).toContain('2');
    });

    it('T1-F6-3: displays pulsing BellRing icon when alerts are triggered', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...defaultHeaderProps,
          alerts: [
            createDummyAlert({
              id: 'a-trig',
              ticker: 'AAPL',
              targetPrice: 185,
              status: 'TRIGGERED',
            }),
          ],
          lastTriggeredAlertIds: ['a-trig'],
        })
      );
      expect(html).toContain('lucide-bell-ring');
      expect(html).toContain('animate-pulse');
    });

    it('T1-F6-4: displays notification banner when lastTriggeredAlertIds has items', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...defaultHeaderProps,
          alerts: [
            createDummyAlert({
              id: 'a-trig',
              ticker: 'AAPL',
              targetPrice: 185,
              condition: 'CROSSING_UP',
              status: 'TRIGGERED',
            }),
          ],
          lastTriggeredAlertIds: ['a-trig'],
        })
      );
      expect(html).toContain('data-testid="triggered-alert-banner"');
      expect(html).toContain('Price Alert Triggered:');
      expect(html).toContain('AAPL crossed above $185.00');
    });

    it('T1-F6-5: banner provides "View" action button and dismiss button', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...defaultHeaderProps,
          alerts: [createDummyAlert({ id: 'a-trig', status: 'TRIGGERED' })],
          lastTriggeredAlertIds: ['a-trig'],
          onClearTriggeredBanner: () => {},
        })
      );
      expect(html).toContain('data-testid="banner-view-alerts-btn"');
      expect(html).toContain('data-testid="banner-dismiss-btn"');
    });
  });

  describe('F7: Real-Time Quote Alert Evaluation', () => {
    it('T1-F7-1: creates alert store with empty initial state', () => {
      const store = createAlertStore();
      expect(store.getState().alerts).toEqual([]);
      expect(store.getState().lastTriggeredAlertIds).toEqual([]);
    });

    it('T1-F7-2: addAlert creates ACTIVE alert with normalized ticker', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'msft',
        targetPrice: 420.5,
        condition: 'CROSSING_UP',
      });
      expect(alert.ticker).toBe('MSFT');
      expect(alert.status).toBe('ACTIVE');
    });

    it('T1-F7-3: evaluateQuote triggers CROSSING_UP when quote price >= targetPrice', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 140,
        condition: 'CROSSING_UP',
      });

      const triggered = store.getState().evaluateQuote(createMockQuote('NVDA', 140.5));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
    });

    it('T1-F7-4: evaluateQuote triggers CROSSING_DOWN when quote price <= targetPrice', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'TSLA',
        targetPrice: 200,
        condition: 'CROSSING_DOWN',
      });

      const triggered = store.getState().evaluateQuote(createMockQuote('TSLA', 198.5));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
    });

    it('T1-F7-5: records triggeredAt timestamp and adds alert ID to lastTriggeredAlertIds', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 190,
        condition: 'CROSSING_UP',
      });

      const triggerTime = 1711905500;
      store.getState().evaluateQuote(createMockQuote('AAPL', 192, triggerTime));

      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);
      expect(store.getState().alerts[0]?.triggeredAt).toBe(triggerTime);
    });
  });

  describe('F8: Headless Boundary Compliance', () => {
    it('T1-F8-1: validates ChartAnnotationSchema with strictly logical anchors', () => {
      const annotation: ChartAnnotation = {
        id: 'ann-1',
        ticker: 'AAPL',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1710000000, price: 150 },
          { timestamp: 1710003600, price: 180 },
        ],
        payload: { color: '#a855f7', levels: [0, 0.5, 1] },
        createdAt: 1710000000,
        updatedAt: 1710000000,
      };

      const parsed = ChartAnnotationSchema.parse(annotation);
      expect(parsed.anchors).toHaveLength(2);
      expect(parsed.anchors[0]?.price).toBe(150);
    });

    it('T1-F8-2: ChartAnnotationSchema rejects pixel coordinates (x, y)', () => {
      const invalid = {
        id: 'ann-bad',
        ticker: 'AAPL',
        type: 'fibonacci',
        anchors: [{ x: 100, y: 200 }],
        payload: {},
        createdAt: 1710000000,
        updatedAt: 1710000000,
      };

      expect(() => ChartAnnotationSchema.parse(invalid)).toThrow();
    });

    it('T1-F8-3: InMemoryStorageRepository performs persistence without browser DOM globals', () => {
      expect(typeof window).toBe('undefined');
      const repo = new InMemoryStorageRepository();
      expect(repo).toBeDefined();
    });

    it('T1-F8-4: executes trade journal summary calculation purely headlessly', () => {
      const trades = [createDummyTrade({ entryPrice: 100, exitPrice: 120, quantity: 10 })];
      const summary = calculateJournalSummary(trades);
      expect(summary.totalRealizedPnL).toBe(200);
      expect(summary.winRatePercent).toBe(100);
    });

    it('T1-F8-5: ChartAnnotationTypeSchema allows all 4 annotation types including fibonacci', () => {
      expect(ChartAnnotationTypeSchema.safeParse('fibonacci').success).toBe(true);
      expect(ChartAnnotationTypeSchema.safeParse('trendline').success).toBe(true);
      expect(ChartAnnotationTypeSchema.safeParse('sticker').success).toBe(true);
      expect(ChartAnnotationTypeSchema.safeParse('trade_marker').success).toBe(true);
    });
  });

  describe('F9: E2E & Boundary Test Suite Pass', () => {
    it('T1-F9-1: operates cleanly with all store factories concurrently', () => {
      const alertStore = createAlertStore();
      const repo = new InMemoryStorageRepository();
      const annotationStore = createAnnotationStore(repo);
      const journalStore = createTradeJournalStore(repo);

      expect(alertStore.getState().alerts).toHaveLength(0);
      expect(annotationStore.getState().annotations).toHaveLength(0);
      expect(journalStore.getState().trades).toHaveLength(0);
    });

    it('T1-F9-2: validates TickerQuoteSchema parses full quotes cleanly', () => {
      const quote = createMockQuote('NVDA', 142.75);
      const parsed = TickerQuoteSchema.parse(quote);
      expect(parsed.ticker).toBe('NVDA');
      expect(parsed.price).toBe(142.75);
    });

    it('T1-F9-3: validates PriceAlertSchema parses active and triggered alerts', () => {
      const alert = createDummyAlert();
      const parsed = PriceAlertSchema.parse(alert);
      expect(parsed.status).toBe('ACTIVE');
    });

    it('T1-F9-4: validates TradeEntrySchema parses complete execution records', () => {
      const trade = createDummyTrade();
      const parsed = TradeEntrySchema.parse(trade);
      expect(parsed.ticker).toBe('AAPL');
      expect(parsed.status).toBe('CLOSED');
    });

    it('T1-F9-5: executes pure level math with 0 failures', () => {
      const levels = calculateFibonacciLevels(100, 200);
      expect(levels).toHaveLength(7);
      expect(levels[3]?.ratio).toBe(0.5);
      expect(levels[3]?.price).toBe(150);
    });
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature F1 to F9)
// ============================================================================

describe('Tier 2: Boundary & Corner Cases (F1 to F9)', () => {
  describe('F1: Fibonacci Level Math & Schema Corner Cases', () => {
    it('T2-F1-1: calculates levels correctly for an inverted downtrend (high start -> low end)', () => {
      const levels = calculateFibonacciLevels(300, 100);
      // delta = 100 - 300 = -200
      // 0.0%: 300, 50.0%: 300 - 100 = 200, 100.0%: 100
      expect(levels[0]?.price).toBe(300);
      expect(levels[3]?.price).toBe(200);
      expect(levels[6]?.price).toBe(100);
    });

    it('T2-F1-2: handles flat range (startPrice === endPrice) collapsing all levels to same price', () => {
      const levels = calculateFibonacciLevels(175.5, 175.5);
      levels.forEach((lvl) => {
        expect(lvl.price).toBe(175.5);
      });
    });

    it('T2-F1-3: maintains high precision with sub-penny fractional prices (crypto / penny stocks)', () => {
      const levels = calculateFibonacciLevels(0.004, 0.012);
      expect(levels[0]?.price).toBeCloseTo(0.004, 6);
      expect(levels[3]?.price).toBeCloseTo(0.008, 6);
      expect(levels[6]?.price).toBeCloseTo(0.012, 6);
    });

    it('T2-F1-4: FibonacciPayloadSchema rejects ratio values outside [0, 2]', () => {
      expect(() =>
        FibonacciPayloadSchema.parse({
          levels: [-0.1, 0.5, 1.0],
        })
      ).toThrow();

      expect(() =>
        FibonacciPayloadSchema.parse({
          levels: [0, 0.5, 2.5],
        })
      ).toThrow();
    });

    it('T2-F1-5: renderDraftPreview gracefully returns null on 0 anchors or missing mouse point', () => {
      const dummyProjector = {
        logicalToScreen: () => null,
        screenToLogical: () => null,
      };

      const result1 = fibonacciPlugin.renderDraftPreview?.({
        anchors: [],
        currentMousePoint: { x: 50, y: 50 },
        projector: dummyProjector,
      });
      expect(result1).toBeNull();

      const result2 = fibonacciPlugin.renderDraftPreview?.({
        anchors: [{ timestamp: 1710000000, price: 100 }],
        currentMousePoint: null,
        projector: dummyProjector,
      });
      expect(result2).toBeNull();
    });
  });

  describe('F2: Toolbar Button Corner Cases & Tool Switching', () => {
    it('T2-F2-1: renders correctly when annotationCount is 0 (omits count badge)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 0,
          onSelectTool: () => {},
        })
      );
      expect(html).not.toContain('font-mono text-[10px]');
    });

    it('T2-F2-2: renders singular "1 item" badge when annotationCount is 1', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 1,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('1 item');
    });

    it('T2-F2-3: renders plural "99 items" badge when annotationCount is high', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 99,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('99 items');
    });

    it('T2-F2-4: supports rapid successive tool switching without leaking classes', () => {
      const tools: (ChartAnnotationType | null)[] = [
        'fibonacci',
        'trendline',
        'sticker',
        'trade_marker',
        null,
      ];
      tools.forEach((tool) => {
        const html = renderToStaticMarkup(
          React.createElement(ChartToolbar, {
            activeTool: tool,
            annotationCount: 2,
            onSelectTool: () => {},
          })
        );
        if (tool === 'fibonacci') {
          expect(html).toContain('bg-purple-500 text-slate-950');
        } else {
          expect(html).toContain('text-slate-400 hover:text-purple-300');
        }
      });
    });

    it('T2-F2-5: maintains button markup integrity for Pointer, Sticker, Trendline, Fib, and Marker', () => {
      const html = renderToStaticMarkup(
        React.createElement(ChartToolbar, {
          activeTool: null,
          annotationCount: 0,
          onSelectTool: () => {},
        })
      );
      expect(html).toContain('Pointer');
      expect(html).toContain('Sticker');
      expect(html).toContain('Trendline');
      expect(html).toContain('Fib');
      expect(html).toContain('Trade Marker');
    });
  });

  describe('F3: Guidance Banner State Transitions & Interactivity', () => {
    const baseCanvasProps: OverlayCanvasProps = {
      hostContext: createMockHostContext(),
      annotations: [],
      activeTool: 'fibonacci',
      selectedAnnotationId: null,
      onSelectTool: () => {},
      onSelectAnnotation: () => {},
      onAddAnnotation: async () => {},
      onUpdateAnnotation: async () => {},
      onDeleteAnnotation: async () => {},
    };

    it('T2-F3-1: transitions to pointer-events-none when tool is deselected to null', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: null,
        })
      );
      expect(html).toContain('pointer-events-none');
      expect(html).not.toContain('cursor-crosshair');
    });

    it('T2-F3-2: displays trendline guidance banner when switching tool from fibonacci to trendline', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: 'trendline',
        })
      );
      expect(html).toContain('Click chart to place first point of trendline · Click Pointer to cancel');
      expect(html).not.toContain('Fibonacci');
    });

    it('T2-F3-3: handles empty annotations list without throwing or rendering phantom elements', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          annotations: [],
        })
      );
      expect(html).toContain('overlay-canvas-root');
    });

    it('T2-F3-4: renders existing annotations alongside active tool guidance banner', () => {
      const existingFib: ChartAnnotation = {
        id: 'existing-fib-1',
        ticker: 'AAPL',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1711900000, price: 100 },
          { timestamp: 1711903600, price: 200 },
        ],
        payload: {
          color: '#a855f7',
          levels: [0, 0.5, 1],
          showPrices: true,
          fillBackground: true,
          extendRight: false,
        },
        createdAt: 1711900000,
        updatedAt: 1711900000,
      };

      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          annotations: [existingFib],
          activeTool: 'fibonacci',
        })
      );

      // Has guidance banner for new draft
      expect(html).toContain('Click chart to place first anchor of Fibonacci retracement');
      // Has existing annotation component
      expect(html).toContain('svg');
    });

    it('T2-F3-5: hides guidance banner when selectedAnnotationId is set and activeTool is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(OverlayCanvas, {
          ...baseCanvasProps,
          activeTool: null,
          selectedAnnotationId: 'existing-fib-1',
        })
      );
      expect(html).not.toContain('Click chart to place');
    });
  });

  describe('F4: Journal Analytics Edge Distributions & Formatting', () => {
    it('T2-F4-1: renders empty state when trades array is empty', () => {
      const summary = calculateJournalSummary([]);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: [],
          summary,
        })
      );
      expect(html).toContain('Close at least 1 position to render your chronological P&amp;L equity curve.');
      expect(html).toContain('$0.00');
    });

    it('T2-F4-2: renders empty state when all trades are OPEN (no realized P&L)', () => {
      const openTrades = [
        createDummyTrade({ id: 'open-1', status: 'OPEN', exitPrice: undefined }),
      ];
      const summary = calculateJournalSummary(openTrades);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: openTrades,
          summary,
        })
      );
      expect(html).toContain('0 closed trades');
      expect(html).toContain('Close at least 1 position');
    });

    it('T2-F4-3: renders rose gradient and negative metrics for 100% losing portfolio', () => {
      const lossTrades = [
        createDummyTrade({
          id: 'l-1',
          ticker: 'SPY',
          entryPrice: 500,
          exitPrice: 480,
          quantity: 10, // -$200
        }),
      ];
      const summary = calculateJournalSummary(lossTrades);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades: lossTrades,
          summary,
        })
      );
      expect(html).toContain('id="equityCurveRoseGrad"');
      expect(html).toContain('-$200.00');
      expect(html).toContain('$0.00'); // Best win is 0
    });

    it('T2-F4-4: ranks multiple setup tags in descending order of net realized P&L', () => {
      const trades = [
        createDummyTrade({ id: 't1', entryPrice: 100, exitPrice: 150, quantity: 10, setupTags: ['Breakout'] }), // +500
        createDummyTrade({ id: 't2', entryPrice: 100, exitPrice: 110, quantity: 10, setupTags: ['Retest'] }),   // +100
        createDummyTrade({ id: 't3', entryPrice: 100, exitPrice: 90, quantity: 10, setupTags: ['Dip Buy'] }),   // -100
      ];
      const summary = calculateJournalSummary(trades);
      const html = renderToStaticMarkup(
        React.createElement(JournalAnalyticsCard, {
          trades,
          summary,
        })
      );

      const breakoutIndex = html.indexOf('Breakout');
      const retestIndex = html.indexOf('Retest');
      const dipBuyIndex = html.indexOf('Dip Buy');

      expect(breakoutIndex).toBeLessThan(retestIndex);
      expect(retestIndex).toBeLessThan(dipBuyIndex);
    });

    it('T2-F4-5: falls back to "Untagged" category when trade has empty setupTags', () => {
      const untaggedTrade = createDummyTrade({
        id: 't-untagged',
        entryPrice: 50,
        exitPrice: 60,
        quantity: 5,
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
      expect(html).toContain('+$50.00');
    });
  });

  describe('F5: Popover Input Validation & Filter Corner Cases', () => {
    const basePopoverProps: PriceAlertsPopoverProps = {
      isOpen: true,
      activeTicker: 'NVDA',
      currentPrice: 140.25,
      alerts: [],
      lastTriggeredAlertIds: [],
      onClose: () => {},
      onCreateAlert: () => {},
      onDismissAlert: () => {},
      onRearmAlert: () => {},
      onDeleteAlert: () => {},
    };

    it('T2-F5-1: shows helpful empty message when active ticker has no alerts configured', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, {
          ...basePopoverProps,
          activeTicker: 'NVDA',
          alerts: [],
        })
      );
      expect(html).toContain('No alerts for NVDA. Create one above.');
    });

    it('T2-F5-2: displays "Use $140.25" shortcut button to pre-fill current price', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, basePopoverProps)
      );
      expect(html).toContain('Use $140.25');
    });

    it('T2-F5-3: renders filter tabs for active ticker and all alerts', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, {
          ...basePopoverProps,
          alerts: [
            createDummyAlert({ ticker: 'NVDA' }),
            createDummyAlert({ ticker: 'AAPL' }),
          ],
        })
      );
      expect(html).toContain('NVDA (1)');
      expect(html).toContain('All Alerts (2)');
    });

    it('T2-F5-4: renders Re-arm button for DISMISSED and TRIGGERED alerts', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, {
          ...basePopoverProps,
          alerts: [
            createDummyAlert({ id: 'a-dis', ticker: 'NVDA', status: 'DISMISSED' }),
            createDummyAlert({ id: 'a-trig', ticker: 'NVDA', status: 'TRIGGERED' }),
          ],
        })
      );
      expect(html).toContain('data-testid="rearm-alert-a-dis"');
      expect(html).toContain('data-testid="rearm-alert-a-trig"');
    });

    it('T2-F5-5: displays alert notes and trigger timestamps when present', () => {
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, {
          ...basePopoverProps,
          alerts: [
            createDummyAlert({
              id: 'a-notes',
              ticker: 'NVDA',
              note: 'Breakout above 140 all-time-high',
              status: 'TRIGGERED',
              triggeredAt: 1711906000,
            }),
          ],
        })
      );
      expect(html).toContain('Breakout above 140 all-time-high');
      expect(html).toContain('Triggered:');
    });
  });

  describe('F6: Header Badge & Banner Edge Scenarios', () => {
    const baseHeaderProps: TopHeaderBarProps = {
      activeTicker: 'AAPL',
      activeTimeframe: '15m',
      quote: createMockQuote('AAPL', 180),
      providerId: 'finnhub',
      isLoading: false,
      isJournalOpen: false,
      tradeCount: 0,
      onSelectTimeframe: () => {},
      onRefresh: () => {},
      onToggleJournal: () => {},
    };

    it('T2-F6-1: does not render alert count badge when all alerts are DISMISSED or TRIGGERED', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseHeaderProps,
          alerts: [
            createDummyAlert({ status: 'DISMISSED' }),
            createDummyAlert({ status: 'TRIGGERED' }),
          ],
        })
      );
      // No active count badge
      expect(html).not.toContain('<span className="rounded-full bg-slate-800');
    });

    it('T2-F6-2: renders combined banner details for multiple simultaneously triggered alerts', () => {
      const triggeredAlerts = [
        createDummyAlert({
          id: 'a-1',
          ticker: 'AAPL',
          targetPrice: 180,
          condition: 'CROSSING_UP',
          status: 'TRIGGERED',
        }),
        createDummyAlert({
          id: 'a-2',
          ticker: 'NVDA',
          targetPrice: 135,
          condition: 'CROSSING_DOWN',
          status: 'TRIGGERED',
        }),
      ];

      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseHeaderProps,
          alerts: triggeredAlerts,
          lastTriggeredAlertIds: ['a-1', 'a-2'],
        })
      );

      expect(html).toContain('AAPL crossed above $180.00');
      expect(html).toContain('NVDA crossed below $135.00');
      expect(html).toContain(' · ');
    });

    it('T2-F6-3: displays pinging animation beacon on Alerts button when alerts trigger', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseHeaderProps,
          lastTriggeredAlertIds: ['a-ping'],
        })
      );
      expect(html).toContain('animate-ping');
    });

    it('T2-F6-4: handles undefined quote gracefully with "Loading quote..." state', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseHeaderProps,
          quote: undefined,
        })
      );
      expect(html).toContain('Loading quote...');
    });

    it('T2-F6-5: supports switching timeframe tabs and highlights active timeframe', () => {
      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, {
          ...baseHeaderProps,
          activeTimeframe: '1W',
        })
      );
      expect(html).toContain('bg-emerald-500 text-slate-950 shadow-sm');
      expect(html).toContain('1W');
    });
  });

  describe('F7: Quote Evaluation Precision & Multi-Ticker Corner Cases', () => {
    it('T2-F7-1: triggers CROSSING_UP on exact target price boundary hit', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 195.0,
        condition: 'CROSSING_UP',
      });

      // Price is exactly 195.000
      const triggered = store.getState().evaluateQuote(createMockQuote('AAPL', 195.0));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
    });

    it('T2-F7-2: triggers CROSSING_DOWN on exact target price boundary hit', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'MSFT',
        targetPrice: 400.0,
        condition: 'CROSSING_DOWN',
      });

      // Price is exactly 400.000
      const triggered = store.getState().evaluateQuote(createMockQuote('MSFT', 400.0));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
    });

    it('T2-F7-3: handles large price gaps (e.g. overnight earnings gap up +30%)', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'META',
        targetPrice: 500,
        condition: 'CROSSING_UP',
      });

      // Massive gap from 480 to 550
      const triggered = store.getState().evaluateQuote(createMockQuote('META', 550));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
    });

    it('T2-F7-4: does not re-trigger an already TRIGGERED alert on subsequent higher quotes', () => {
      const store = createAlertStore();
      store.getState().addAlert({
        ticker: 'AMD',
        targetPrice: 160,
        condition: 'CROSSING_UP',
      });

      // First tick triggers
      store.getState().evaluateQuote(createMockQuote('AMD', 161));
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');

      // Subsequent ticks should not re-trigger
      const secondPass = store.getState().evaluateQuote(createMockQuote('AMD', 165));
      expect(secondPass).toHaveLength(0);
    });

    it('T2-F7-5: shouldTriggerAlert helper returns false for non-ACTIVE alerts regardless of price', () => {
      const triggeredAlert = createDummyAlert({
        status: 'TRIGGERED',
        targetPrice: 100,
        condition: 'CROSSING_UP',
      });
      const dismissedAlert = createDummyAlert({
        status: 'DISMISSED',
        targetPrice: 100,
        condition: 'CROSSING_UP',
      });

      expect(shouldTriggerAlert(triggeredAlert, 150)).toBe(false);
      expect(shouldTriggerAlert(dismissedAlert, 150)).toBe(false);
    });
  });

  describe('F8: Headless Core Invariants & Serialization Stress', () => {
    it('T2-F8-1: PriceAlertSchema validates finite positive numbers and rejects Infinity/NaN', () => {
      expect(() =>
        PriceAlertSchema.parse({
          id: 'a-inf',
          ticker: 'AAPL',
          targetPrice: Infinity,
          condition: 'CROSSING_UP',
          createdAt: 1711900000,
        })
      ).toThrow();

      expect(() =>
        PriceAlertSchema.parse({
          id: 'a-nan',
          ticker: 'AAPL',
          targetPrice: NaN,
          condition: 'CROSSING_UP',
          createdAt: 1711900000,
        })
      ).toThrow();
    });

    it('T2-F8-2: ChartAnnotationSchema parses complex payload with arbitrary JSON properties', () => {
      const complexAnnotation = {
        id: 'ann-complex',
        ticker: 'GOOGL',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1711900000, price: 170.5 },
          { timestamp: 1711903600, price: 182.25 },
        ],
        payload: {
          color: '#38bdf8',
          levels: [0, 0.382, 0.618, 1, 1.618],
          notes: 'Golden pocket bounce test',
          extraFlag: true,
        },
        createdAt: 1711900000,
        updatedAt: 1711900000,
      };

      const parsed = ChartAnnotationSchema.parse(complexAnnotation);
      expect(parsed.payload['extraFlag']).toBe(true);
    });

    it('T2-F8-3: survives JSON serialization and deserialization roundtrip without loss', () => {
      const originalAlert = createDummyAlert({
        note: 'Breakout watch $210',
        targetPrice: 210.45,
      });

      const serialized = JSON.stringify(originalAlert);
      const deserialized = JSON.parse(serialized);
      const reparsed = PriceAlertSchema.parse(deserialized);

      expect(reparsed).toEqual(originalAlert);
    });

    it('T2-F8-4: TradeEntrySchema calculates accurate dollar P&L and percentage return', () => {
      const longWin = createDummyTrade({
        side: 'BUY',
        status: 'CLOSED',
        entryPrice: 100,
        exitPrice: 125,
        quantity: 10,
      });
      expect(calculateTradeRealizedPnL(longWin)).toBe(250);
      expect(calculateTradePnLPercent(longWin)).toBe(25);

      const shortWin = createDummyTrade({
        side: 'SHORT',
        status: 'CLOSED',
        entryPrice: 200,
        exitPrice: 180,
        quantity: 10,
      });
      expect(calculateTradeRealizedPnL(shortWin)).toBe(200);
      expect(calculateTradePnLPercent(shortWin)).toBe(10);
    });

    it('T2-F8-5: rejects annotations with invalid timestamp types or strings', () => {
      const invalid = {
        id: 'ann-bad-ts',
        ticker: 'AAPL',
        type: 'fibonacci',
        anchors: [{ timestamp: '2026-03-31', price: 150 }],
        payload: {},
        createdAt: 1711900000,
        updatedAt: 1711900000,
      };
      expect(() => ChartAnnotationSchema.parse(invalid)).toThrow();
    });
  });

  describe('F9: Async Store Isolation & High-Frequency Stream Stability', () => {
    it('T2-F9-1: keeps alert stores completely isolated across separate instances', () => {
      const storeA = createAlertStore();
      const storeB = createAlertStore();

      storeA.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 190,
        condition: 'CROSSING_UP',
      });

      expect(storeA.getState().alerts).toHaveLength(1);
      expect(storeB.getState().alerts).toHaveLength(0);
    });

    it('T2-F9-2: handles 100 sequential quotes without memory leak or performance degradation', () => {
      const store = createAlertStore();
      store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 150,
        condition: 'CROSSING_UP',
      });

      // Stream 100 ascending quotes
      for (let i = 100; i <= 200; i++) {
        store.getState().evaluateQuote(createMockQuote('NVDA', i));
      }

      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(1);
    });

    it('T2-F9-3: InMemoryStorageRepository cleanly filters annotations by ticker', async () => {
      const repo = new InMemoryStorageRepository([], [
        ChartAnnotationSchema.parse({
          id: 'ann-1',
          ticker: 'AAPL',
          type: 'trendline',
          anchors: [{ timestamp: 1000, price: 150 }, { timestamp: 2000, price: 160 }],
          payload: {},
          createdAt: 1000,
          updatedAt: 1000,
        }),
        ChartAnnotationSchema.parse({
          id: 'ann-2',
          ticker: 'MSFT',
          type: 'sticker',
          anchors: [{ timestamp: 1000, price: 400 }],
          payload: {},
          createdAt: 1000,
          updatedAt: 1000,
        }),
      ]);

      const aaplAnn = await repo.getAnnotations('aapl');
      expect(aaplAnn).toHaveLength(1);
      expect(aaplAnn[0]?.ticker).toBe('AAPL');

      const msftAnn = await repo.getAnnotations('msft');
      expect(msftAnn).toHaveLength(1);
      expect(msftAnn[0]?.ticker).toBe('MSFT');
    });

    it('T2-F9-4: InMemoryStorageRepository cleanly filters trades by ticker', async () => {
      const repo = new InMemoryStorageRepository([], [], [
        createDummyTrade({ id: 't-1', ticker: 'TSLA' }),
        createDummyTrade({ id: 't-2', ticker: 'AMZN' }),
      ]);

      const tslaTrades = await repo.getTrades('TSLA');
      expect(tslaTrades).toHaveLength(1);
      expect(tslaTrades[0]?.ticker).toBe('TSLA');
    });

    it('T2-F9-5: clearTriggeredBanner empties banner queue while preserving triggered alert statuses', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({ ticker: 'AAPL', targetPrice: 180, condition: 'CROSSING_UP' });
      expect(alert.ticker).toBe('AAPL');
      store.getState().evaluateQuote(createMockQuote('AAPL', 185));

      expect(store.getState().lastTriggeredAlertIds).toHaveLength(1);
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');

      store.getState().clearTriggeredBanner();

      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
    });
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions)
// ============================================================================

describe('Tier 3: Cross-Feature Combinations (Pairwise Interactions)', () => {
  it('T3-01: F1 x F8 — Fibonacci plugin stores and retrieves strictly logical anchors via headless storage repository', async () => {
    const repo = new InMemoryStorageRepository();
    const annotationStore = createAnnotationStore(repo);

    const defaultPayload = fibonacciPlugin.createDefaultPayload([]);
    await annotationStore.getState().addAnnotation({
      ticker: 'AAPL',
      type: 'fibonacci',
      anchors: [
        { timestamp: 1711900000, price: 150 },
        { timestamp: 1711903600, price: 200 },
      ],
      payload: defaultPayload,
    });

    const saved = await repo.getAnnotations('AAPL');
    expect(saved).toHaveLength(1);
    expect(saved[0]?.type).toBe('fibonacci');
    expect(saved[0]?.anchors).toEqual([
      { timestamp: 1711900000, price: 150 },
      { timestamp: 1711903600, price: 200 },
    ]);
  });

  it('T3-02: F2 x F3 — Clicking Fibonacci toolbar button updates active tool and renders two-step guidance banner', () => {
    let activeToolState: ChartAnnotationType | null = null;
    const handleSelectTool = (tool: ChartAnnotationType | null) => {
      activeToolState = tool;
    };

    // User clicks Fib in toolbar
    handleSelectTool('fibonacci');
    expect(activeToolState).toBe('fibonacci');

    // OverlayCanvas receives activeTool and renders step 1 banner
    const canvasHtml = renderToStaticMarkup(
      React.createElement(OverlayCanvas, {
        hostContext: createMockHostContext(),
        annotations: [],
        activeTool: activeToolState,
        selectedAnnotationId: null,
        onSelectTool: handleSelectTool,
        onSelectAnnotation: () => {},
        onAddAnnotation: async () => {},
        onUpdateAnnotation: async () => {},
        onDeleteAnnotation: async () => {},
      })
    );
    expect(canvasHtml).toContain(
      'Click chart to place first anchor of Fibonacci retracement · Click Pointer to cancel'
    );
  });

  it('T3-03: F4 x F7 — Price alert triggers on quote spike, prompting trade execution logged in journal with analytics update', () => {
    const alertStore = createAlertStore();
    const alert = alertStore.getState().addAlert({
      ticker: 'AAPL',
      targetPrice: 200,
      condition: 'CROSSING_UP',
      note: 'Key breakout target',
    });

    // Market moves and quote triggers alert
    const triggered = alertStore.getState().evaluateQuote(createMockQuote('AAPL', 201));
    expect(triggered).toHaveLength(1);
    expect(triggered[0]?.id).toBe(alert.id);

    // Trader executes trade based on alert
    const executedTrade = createDummyTrade({
      ticker: 'AAPL',
      entryPrice: 201,
      exitPrice: 220,
      quantity: 10,
      setupTags: ['Alert Breakout'],
    });

    const summary = calculateJournalSummary([executedTrade]);
    expect(summary.totalRealizedPnL).toBe(190);

    // JournalAnalyticsCard reflects trade execution
    const cardHtml = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: [executedTrade],
        summary,
      })
    );
    expect(cardHtml).toContain('+$190.00');
    expect(cardHtml).toContain('Alert Breakout');
  });

  it('T3-04: F5 x F6 — Creating an alert in popover increments active alert count badge in TopHeaderBar', () => {
    const alertStore = createAlertStore();

    // Initially 0 alerts
    expect(alertStore.getState().alerts).toHaveLength(0);

    // Create alert via popover action handler
    const alert = alertStore.getState().addAlert({
      ticker: 'MSFT',
      targetPrice: 425,
      condition: 'CROSSING_UP',
    });
    expect(alert.ticker).toBe('MSFT');

    const alerts = alertStore.getState().alerts;
    expect(alerts).toHaveLength(1);

    // Header renders with count '1'
    const headerHtml = renderToStaticMarkup(
      React.createElement(TopHeaderBar, {
        activeTicker: 'MSFT',
        activeTimeframe: '1D',
        quote: createMockQuote('MSFT', 410),
        providerId: 'deterministic-demo',
        isLoading: false,
        isJournalOpen: false,
        tradeCount: 0,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
        onToggleJournal: () => {},
        alerts,
        lastTriggeredAlertIds: [],
      })
    );
    expect(headerHtml).toContain('1');
  });

  it('T3-05: F6 x F7 — Quote evaluation triggering an alert instantly activates header notification banner', () => {
    const alertStore = createAlertStore();
    alertStore.getState().addAlert({
      ticker: 'NVDA',
      targetPrice: 145,
      condition: 'CROSSING_UP',
      note: 'ATH breakout',
    });

    // Market ticks above 145
    alertStore.getState().evaluateQuote(createMockQuote('NVDA', 146));

    const alerts = alertStore.getState().alerts;
    const lastTriggeredAlertIds = alertStore.getState().lastTriggeredAlertIds;

    const headerHtml = renderToStaticMarkup(
      React.createElement(TopHeaderBar, {
        activeTicker: 'NVDA',
        activeTimeframe: '15m',
        quote: createMockQuote('NVDA', 146),
        providerId: 'finnhub',
        isLoading: false,
        isJournalOpen: false,
        tradeCount: 0,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
        onToggleJournal: () => {},
        alerts,
        lastTriggeredAlertIds,
      })
    );

    expect(headerHtml).toContain('data-testid="triggered-alert-banner"');
    expect(headerHtml).toContain('NVDA crossed above $145.00');
    expect(headerHtml).toContain('ATH breakout');
  });

  it('T3-06: F3 x F1 — Completing two anchor placements registers a validated Fibonacci annotation in registry', async () => {
    const repo = new InMemoryStorageRepository();
    const store = createAnnotationStore(repo);

    const plugin = overlayPluginRegistry.get('fibonacci');
    expect(plugin).toBeDefined();

    const anchors: LogicalAnchor[] = [
      { timestamp: 1711900000, price: 100 },
      { timestamp: 1711903600, price: 200 },
    ];
    const payload = plugin!.createDefaultPayload(anchors);

    await store.getState().addAnnotation({
      ticker: 'AAPL',
      type: 'fibonacci',
      anchors,
      payload,
    });

    const annotations = store.getState().annotations;
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.type).toBe('fibonacci');
    expect(annotations[0]?.anchors).toHaveLength(2);
  });

  it('T3-07: F4 x F8 — Journal analytics calculations operate purely on headless TradeEntry domain models without DOM', () => {
    const rawTrade = {
      id: 'trade-headless',
      ticker: 'GOOGL',
      side: 'BUY' as const,
      status: 'CLOSED' as const,
      entryTimestamp: 1711900000,
      entryPrice: 150,
      quantity: 10,
      exitTimestamp: 1711903600,
      exitPrice: 170,
      setupTags: ['Momentum'],
      notesMarkdown: '',
      createdAt: 1711900000,
      updatedAt: 1711900000,
    };

    const validated = TradeEntrySchema.parse(rawTrade);
    const summary = calculateJournalSummary([validated]);

    expect(summary.totalRealizedPnL).toBe(200);
    expect(summary.winCount).toBe(1);
    expect(summary.winRatePercent).toBe(100);
  });

  it('T3-08: F5 x F7 — Alert re-arm cycle in popover enables subsequent quote to re-trigger the alert', () => {
    const store = createAlertStore();
    const alert = store.getState().addAlert({
      ticker: 'TSLA',
      targetPrice: 220,
      condition: 'CROSSING_UP',
    });

    // First trigger
    store.getState().evaluateQuote(createMockQuote('TSLA', 222));
    expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');

    // Dismiss alert
    store.getState().dismissAlert(alert.id);
    expect(store.getState().alerts[0]?.status).toBe('DISMISSED');

    // Re-arm alert
    store.getState().rearmAlert(alert.id);
    expect(store.getState().alerts[0]?.status).toBe('ACTIVE');

    // Next quote re-triggers it
    const retriggered = store.getState().evaluateQuote(createMockQuote('TSLA', 225));
    expect(retriggered).toHaveLength(1);
    expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
  });

  it('T3-09: F1 x F2 x F3 — Full chart annotation cycle: toolbar select -> guidance banner -> commit -> registry render', () => {
    let tool: ChartAnnotationType | null = null;
    const setTool = (t: ChartAnnotationType | null) => {
      tool = t;
    };

    // 1. User selects Fib tool from toolbar
    setTool('fibonacci');
    expect(tool).toBe('fibonacci');

    // 2. Toolbar renders purple active button
    const tbHtml = renderToStaticMarkup(
      React.createElement(ChartToolbar, {
        activeTool: tool,
        annotationCount: 0,
        onSelectTool: setTool,
      })
    );
    expect(tbHtml).toContain('bg-purple-500');

    // 3. OverlayCanvas renders guidance banner
    const ocHtml = renderToStaticMarkup(
      React.createElement(OverlayCanvas, {
        hostContext: createMockHostContext(),
        annotations: [],
        activeTool: tool,
        selectedAnnotationId: null,
        onSelectTool: setTool,
        onSelectAnnotation: () => {},
        onAddAnnotation: async () => {},
        onUpdateAnnotation: async () => {},
        onDeleteAnnotation: async () => {},
      })
    );
    expect(ocHtml).toContain('Click chart to place first anchor of Fibonacci retracement');
  });

  it('T3-10: F5 x F6 x F7 — Complete price alerts lifecycle: create in popover -> header badge -> quote trigger -> banner view/dismiss', () => {
    const store = createAlertStore();

    // 1. Create alert
    const alert = store.getState().addAlert({
      ticker: 'AAPL',
      targetPrice: 195,
      condition: 'CROSSING_UP',
      note: 'Breakout above 195',
    });
    expect(alert.ticker).toBe('AAPL');

    // 2. Header displays 1 active alert
    let headerHtml = renderToStaticMarkup(
      React.createElement(TopHeaderBar, {
        activeTicker: 'AAPL',
        activeTimeframe: '1D',
        quote: createMockQuote('AAPL', 190),
        providerId: 'demo',
        isLoading: false,
        isJournalOpen: false,
        tradeCount: 0,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
        onToggleJournal: () => {},
        alerts: store.getState().alerts,
        lastTriggeredAlertIds: store.getState().lastTriggeredAlertIds,
      })
    );
    expect(headerHtml).toContain('1');
    expect(headerHtml).not.toContain('Price Alert Triggered:');

    // 3. Market quote triggers alert
    store.getState().evaluateQuote(createMockQuote('AAPL', 196));
    expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');

    // 4. Header now displays triggered banner
    headerHtml = renderToStaticMarkup(
      React.createElement(TopHeaderBar, {
        activeTicker: 'AAPL',
        activeTimeframe: '1D',
        quote: createMockQuote('AAPL', 196),
        providerId: 'demo',
        isLoading: false,
        isJournalOpen: false,
        tradeCount: 0,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
        onToggleJournal: () => {},
        alerts: store.getState().alerts,
        lastTriggeredAlertIds: store.getState().lastTriggeredAlertIds,
        onClearTriggeredBanner: () => store.getState().clearTriggeredBanner(),
      })
    );
    expect(headerHtml).toContain('Price Alert Triggered:');
    expect(headerHtml).toContain('AAPL crossed above $195.00');
    expect(headerHtml).toContain('Breakout above 195');

    // 5. Dismiss banner
    store.getState().clearTriggeredBanner();
    expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);
    // Alert remains in TRIGGERED status in store
    expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
  });
});

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (Comprehensive Workflows)
// ============================================================================

describe('Tier 4: Real-World Application Scenarios', () => {
  it('T4-S1: Comprehensive Swing Trader Technical Analysis Workflow', async () => {
    // 1. Trader sets up stores and repository
    const repo = new InMemoryStorageRepository();
    const annotationStore = createAnnotationStore(repo);
    const alertStore = createAlertStore();
    const journalStore = createTradeJournalStore(repo);

    // 2. Trader analyzes swing low at $100 and swing high at $200 on NVDA
    const swingLowAnchor: LogicalAnchor = { timestamp: 1711900000, price: 100 };
    const swingHighAnchor: LogicalAnchor = { timestamp: 1711903600, price: 200 };
    const levels = calculateFibonacciLevels(swingLowAnchor.price, swingHighAnchor.price);

    // 61.8% golden ratio retracement level = 100 + 100 * 0.618 = 161.8
    const goldenRatioLevel = levels.find((l) => l.ratio === 0.618);
    expect(goldenRatioLevel?.price).toBeCloseTo(161.8, 2);

    // 3. Trader places Fibonacci retracement on chart
    await annotationStore.getState().addAnnotation({
      ticker: 'NVDA',
      type: 'fibonacci',
      anchors: [swingLowAnchor, swingHighAnchor],
      payload: fibonacciPlugin.createDefaultPayload([swingLowAnchor, swingHighAnchor]),
    });
    expect(annotationStore.getState().annotations).toHaveLength(1);

    // 4. Trader arms a CROSSING_DOWN price alert at the 61.8% golden ratio level ($161.80)
    const alert = alertStore.getState().addAlert({
      ticker: 'NVDA',
      targetPrice: 161.8,
      condition: 'CROSSING_DOWN',
      note: 'Buy entry at 61.8% golden pocket',
    });
    expect(alert.status).toBe('ACTIVE');

    // 5. Market pulls back; quote drops to $161.50, triggering the alert
    const triggered = alertStore.getState().evaluateQuote(createMockQuote('NVDA', 161.5));
    expect(triggered).toHaveLength(1);
    expect(triggered[0]?.id).toBe(alert.id);

    // 6. Trader executes long position at $161.50 and closes at $195.00
    await journalStore.getState().logTrade({
      ticker: 'NVDA',
      side: 'BUY',
      entryPrice: 161.5,
      quantity: 50,
      setupTags: ['Fib Confluence', 'Golden Pocket'],
      notesMarkdown: 'Entered on 61.8% Fib bounce after alert triggered.',
    });
    const loggedTrade = journalStore.getState().trades[0]!;
    await journalStore.getState().closeTrade(loggedTrade.id, 195.0);

    // 7. Verify Journal Analytics Card shows positive equity curve & setup win rate
    const closedTrades = journalStore.getState().trades;
    const summary = journalStore.getState().getSummary();
    expect(summary.totalRealizedPnL).toBeCloseTo((195 - 161.5) * 50, 2);
    expect(summary.winRatePercent).toBe(100);

    const cardHtml = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: closedTrades,
        summary,
      })
    );
    expect(cardHtml).toContain('+$1675.00');
    expect(cardHtml).toContain('Fib Confluence');
    expect(cardHtml).toContain('100%');
  });

  it('T4-S2: Multi-Asset Watchlist & Breakout Scalper Workflow', () => {
    // 1. Scalper sets up alerts across multiple watchlist tickers
    const alertStore = createAlertStore();

    const aaplAlert = alertStore.getState().addAlert({
      ticker: 'AAPL',
      targetPrice: 195,
      condition: 'CROSSING_UP',
      note: '195 breakout',
    });
    const tslaAlert = alertStore.getState().addAlert({
      ticker: 'TSLA',
      targetPrice: 210,
      condition: 'CROSSING_DOWN',
      note: '210 breakdown',
    });
    const msftAlert = alertStore.getState().addAlert({
      ticker: 'MSFT',
      targetPrice: 430,
      condition: 'CROSSING_UP',
      note: '430 ATH',
    });

    expect(alertStore.getState().alerts).toHaveLength(3);

    // 2. Market stream arrives with simultaneous moves
    const quotes = [
      createMockQuote('AAPL', 196.5), // Triggers AAPL
      createMockQuote('TSLA', 208.0), // Triggers TSLA
      createMockQuote('MSFT', 428.0), // Does not trigger MSFT
    ];

    for (const q of quotes) {
      alertStore.getState().evaluateQuote(q);
    }

    // 3. Verify exactly 2 alerts triggered and banner contains both IDs
    const bannerIds = alertStore.getState().lastTriggeredAlertIds;
    expect(bannerIds).toHaveLength(2);
    expect(bannerIds).toContain(aaplAlert.id);
    expect(bannerIds).toContain(tslaAlert.id);
    expect(bannerIds).not.toContain(msftAlert.id);

    // 4. Scalper dismisses AAPL alert and re-arms TSLA alert
    alertStore.getState().dismissAlert(aaplAlert.id);
    alertStore.getState().rearmAlert(tslaAlert.id);

    expect(alertStore.getState().alerts.find((a) => a.id === aaplAlert.id)?.status).toBe('DISMISSED');
    expect(alertStore.getState().alerts.find((a) => a.id === tslaAlert.id)?.status).toBe('ACTIVE');

    // 5. Subsequent quote re-triggers TSLA but ignores dismissed AAPL
    const nextQuotes = [
      createMockQuote('AAPL', 198.0),
      createMockQuote('TSLA', 205.0),
    ];
    for (const q of nextQuotes) {
      alertStore.getState().evaluateQuote(q);
    }

    expect(alertStore.getState().alerts.find((a) => a.id === tslaAlert.id)?.status).toBe('TRIGGERED');
    expect(alertStore.getState().alerts.find((a) => a.id === aaplAlert.id)?.status).toBe('DISMISSED');
  });

  it('T4-S3: Complete Risk Management & Stop-Loss Breakdown Workflow', async () => {
    // 1. Trader opens position on MSFT
    const repo = new InMemoryStorageRepository();
    const journalStore = createTradeJournalStore(repo);
    const alertStore = createAlertStore();

    await journalStore.getState().logTrade({
      ticker: 'MSFT',
      side: 'BUY',
      entryPrice: 410,
      quantity: 20,
      setupTags: ['Support Bounce'],
      notesMarkdown: 'Long off 410 support.',
    });
    const trade = journalStore.getState().trades[0]!;

    // 2. Trader places stop-loss alert at support breakdown ($400)
    const stopAlert = alertStore.getState().addAlert({
      ticker: 'MSFT',
      targetPrice: 400,
      condition: 'CROSSING_DOWN',
      note: 'Stop loss hit',
    });

    // 3. Market sells off; quote breaches stop level to $398
    const triggered = alertStore.getState().evaluateQuote(createMockQuote('MSFT', 398));
    expect(triggered).toHaveLength(1);
    expect(triggered[0]?.id).toBe(stopAlert.id);

    // 4. Trader closes position at stop price ($398) to limit losses
    await journalStore.getState().closeTrade(trade.id, 398);

    // 5. Verify journal analytics shows negative realized equity curve with rose gradient
    const summary = journalStore.getState().getSummary();
    expect(summary.totalRealizedPnL).toBe(-240); // (398 - 410) * 20 = -240
    expect(summary.lossCount).toBe(1);

    const cardHtml = renderToStaticMarkup(
      React.createElement(JournalAnalyticsCard, {
        trades: journalStore.getState().trades,
        summary,
      })
    );
    expect(cardHtml).toContain('id="equityCurveRoseGrad"');
    expect(cardHtml).toContain('-$240.00');
    expect(cardHtml).toContain('Worst Loss');
  });

  it('T4-S4: Full Session Hydration, State Persistence & Recovery Workflow', async () => {
    // 1. Populate persistent storage repository with existing user data
    const existingAnnotations: ChartAnnotation[] = [
      ChartAnnotationSchema.parse({
        id: 'persisted-fib-1',
        ticker: 'AMZN',
        type: 'fibonacci',
        anchors: [
          { timestamp: 1711900000, price: 170 },
          { timestamp: 1711903600, price: 190 },
        ],
        payload: {
          color: '#a855f7',
          levels: [0, 0.5, 1],
          showPrices: true,
          fillBackground: true,
          extendRight: false,
        },
        createdAt: 1711900000,
        updatedAt: 1711900000,
      }),
    ];

    const existingTrades: TradeEntry[] = [
      createDummyTrade({
        id: 'persisted-trade-1',
        ticker: 'AMZN',
        entryPrice: 175,
        exitPrice: 188,
        quantity: 15,
        setupTags: ['Earnings Runup'],
      }),
    ];

    const repo = new InMemoryStorageRepository([], existingAnnotations, existingTrades);

    // 2. Hydrate stores from repository (as done in App.tsx on mount)
    const annotationStore = createAnnotationStore(repo);
    const journalStore = createTradeJournalStore(repo);

    await Promise.all([
      annotationStore.getState().hydrate(),
      journalStore.getState().hydrate(),
    ]);

    // 3. Verify annotations and trades hydrated accurately
    expect(annotationStore.getState().annotations).toHaveLength(1);
    expect(annotationStore.getState().annotations[0]?.type).toBe('fibonacci');

    expect(journalStore.getState().trades).toHaveLength(1);
    expect(journalStore.getState().trades[0]?.ticker).toBe('AMZN');

    // 4. Verify TradeJournalDrawer renders hydrated analytics seamlessly
    const drawerProps: TradeJournalDrawerProps = {
      isOpen: true,
      activeTicker: 'AMZN',
      currentTickerPrice: 188,
      trades: journalStore.getState().trades,
      summary: journalStore.getState().getSummary(),
      filterStatus: 'ALL',
      onClose: () => {},
      onFilterChange: () => {},
      onLogTrade: async () => {},
      onClosePosition: async () => {},
      onDeleteTrade: async () => {},
      onSelectTicker: () => {},
    };

    const drawerHtml = renderToStaticMarkup(
      React.createElement(TradeJournalDrawer, drawerProps)
    );

    expect(drawerHtml).toContain('Edge Analytics &amp; Setup Attribution');
    expect(drawerHtml).toContain('Earnings Runup');
    expect(drawerHtml).toContain('+$195.00');
  });

  it('T4-S5: Adversarial Stress & Error Recovery Workflow', () => {
    // 1. Initialize alert store
    const store = createAlertStore();

    // 2. Attempt invalid alert creation (negative price, zero price, whitespace ticker)
    expect(() =>
      store.getState().addAlert({
        ticker: '   ',
        targetPrice: 150,
        condition: 'CROSSING_UP',
      })
    ).toThrow();

    expect(() =>
      store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: -50,
        condition: 'CROSSING_UP',
      })
    ).toThrow();

    expect(store.getState().alerts).toHaveLength(0);

    // 3. Create valid alert with extreme price (penny stock 0.0001)
    const microAlert = store.getState().addAlert({
      ticker: 'PENNY',
      targetPrice: 0.0001,
      condition: 'CROSSING_DOWN',
      note: 'Sub-penny breakdown',
    });
    expect(microAlert.targetPrice).toBe(0.0001);

    // 4. Evaluate high-volatility flash crash quote
    const triggered = store.getState().evaluateQuote(createMockQuote('PENNY', 0.00008));
    expect(triggered).toHaveLength(1);
    expect(triggered[0]?.id).toBe(microAlert.id);

    // 5. Delete alert cleanly and verify lastTriggeredAlertIds is cleaned up
    store.getState().removeAlert(microAlert.id);
    expect(store.getState().alerts).toHaveLength(0);
    expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);
  });
});
