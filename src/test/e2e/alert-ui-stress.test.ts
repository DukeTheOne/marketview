import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PriceAlertSchema,
  type AlertCondition,
  type PriceAlert,
} from '../../core/schemas/alert';
import type { TickerQuote } from '../../core/schemas/market';
import { createAlertStore } from '../../core/stores/alertStore';
import {
  PriceAlertsPopover,
  type PriceAlertsPopoverProps,
} from '../../ui/alerts/PriceAlertsPopover';
import {
  TopHeaderBar,
  type TopHeaderBarProps,
} from '../../ui/layout/TopHeaderBar';

function createMockAlert(
  id: string,
  ticker: string,
  targetPrice: number,
  condition: AlertCondition = 'CROSSING_UP',
  status: 'ACTIVE' | 'TRIGGERED' | 'DISMISSED' = 'ACTIVE',
  triggeredAt?: number
): PriceAlert {
  return PriceAlertSchema.parse({
    id,
    ticker,
    targetPrice,
    condition,
    status,
    note: `Alert ${id}`,
    createdAt: 1711800000,
    triggeredAt,
  });
}

describe('Challenger 2: Price Alerts UI & Integration Stress Suite', () => {
  describe('PriceAlertsPopover Large-Scale Rendering & Stress', () => {
    it('renders smoothly with 200 alerts across diverse symbols without crashing', () => {
      const alerts: PriceAlert[] = [];
      const symbols = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'GOOGL'];

      for (let i = 0; i < 200; i++) {
        const symbol = symbols[i % symbols.length]!;
        const status =
          i % 3 === 0 ? 'TRIGGERED' : i % 3 === 1 ? 'ACTIVE' : 'DISMISSED';
        alerts.push(
          createMockAlert(
            `alert-${i}`,
            symbol,
            100 + i * 2,
            i % 2 === 0 ? 'CROSSING_UP' : 'CROSSING_DOWN',
            status,
            status === 'TRIGGERED' ? 1711900000 + i : undefined
          )
        );
      }

      const props: PriceAlertsPopoverProps = {
        isOpen: true,
        activeTicker: 'AAPL',
        currentPrice: 185.5,
        alerts,
        lastTriggeredAlertIds: alerts
          .filter((a) => a.status === 'TRIGGERED')
          .map((a) => a.id),
        onClose: () => {},
        onCreateAlert: () => {},
        onDismissAlert: () => {},
        onRearmAlert: () => {},
        onDeleteAlert: () => {},
        onClearTriggeredBanner: () => {},
      };

      const startMs = Date.now();
      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, props)
      );
      const renderMs = Date.now() - startMs;

      expect(html).toContain('Price Alerts');
      expect(html).toContain('AAPL');
      expect(html).toContain('Use $185.50');
      // Ticker filter tab should display correct count for AAPL (200 / 5 = 40)
      expect(html).toContain('AAPL (40)');
      expect(html).toContain('All Alerts (200)');
      // Render should be performant (<200ms)
      expect(renderMs).toBeLessThan(200);
    });

    it('renders empty list state gracefully when ticker has zero alerts', () => {
      const props: PriceAlertsPopoverProps = {
        isOpen: true,
        activeTicker: 'GHOST',
        currentPrice: 99.0,
        alerts: [createMockAlert('a1', 'AAPL', 150)],
        lastTriggeredAlertIds: [],
        onClose: () => {},
        onCreateAlert: () => {},
        onDismissAlert: () => {},
        onRearmAlert: () => {},
        onDeleteAlert: () => {},
      };

      const html = renderToStaticMarkup(
        React.createElement(PriceAlertsPopover, props)
      );

      expect(html).toContain('No alerts for GHOST. Create one above.');
    });
  });

  describe('TopHeaderBar Triggered Alert Banner Stress', () => {
    it('renders notification banner with multiple simultaneous triggered alerts correctly', () => {
      const triggeredAlerts = [
        createMockAlert('a1', 'AAPL', 190, 'CROSSING_UP', 'TRIGGERED', 1711900100),
        createMockAlert('a2', 'NVDA', 140, 'CROSSING_UP', 'TRIGGERED', 1711900105),
        createMockAlert('a3', 'TSLA', 210, 'CROSSING_DOWN', 'TRIGGERED', 1711900110),
      ];

      const headerProps: TopHeaderBarProps = {
        activeTicker: 'AAPL',
        activeTimeframe: '1D',
        quote: {
          ticker: 'AAPL',
          price: 195.0,
          change: 2.5,
          changePercent: 1.3,
          high: 196.0,
          low: 191.0,
          open: 192.0,
          previousClose: 192.5,
          timestamp: 1711900200,
        },
        providerId: 'demo',
        isLoading: false,
        isJournalOpen: false,
        tradeCount: 0,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
        onToggleJournal: () => {},
        alerts: triggeredAlerts,
        lastTriggeredAlertIds: ['a1', 'a2', 'a3'],
        onClearTriggeredBanner: () => {},
      };

      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, headerProps)
      );

      expect(html).toContain('data-testid="triggered-alert-banner"');
      expect(html).toContain('AAPL crossed above $190.00');
      expect(html).toContain('NVDA crossed above $140.00');
      expect(html).toContain('TSLA crossed below $210.00');
      expect(html).toContain('data-testid="banner-view-alerts-btn"');
      expect(html).toContain('data-testid="banner-dismiss-btn"');
    });

    it('falls back to count summary when banner alert IDs are not present in alerts list', () => {
      const headerProps: TopHeaderBarProps = {
        activeTicker: 'AAPL',
        activeTimeframe: '1D',
        quote: undefined,
        providerId: 'demo',
        isLoading: false,
        isJournalOpen: false,
        tradeCount: 0,
        onSelectTimeframe: () => {},
        onRefresh: () => {},
        onToggleJournal: () => {},
        alerts: [], // Empty alerts list but stale banner IDs
        lastTriggeredAlertIds: ['orphan-1', 'orphan-2'],
      };

      const html = renderToStaticMarkup(
        React.createElement(TopHeaderBar, headerProps)
      );

      expect(html).toContain('data-testid="triggered-alert-banner"');
      expect(html).toContain('2 alert(s) triggered');
    });
  });

  describe('App.tsx Real-Time Quote Evaluation Loop Simulation', () => {
    it('simulates the App.tsx useEffect quote evaluation pattern under rapid multi-ticker batches', () => {
      const store = createAlertStore();

      // Set up alerts on 5 tickers
      const a1 = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 200,
        condition: 'CROSSING_UP',
      });
      const a2 = store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 150,
        condition: 'CROSSING_UP',
      });
      const a3 = store.getState().addAlert({
        ticker: 'TSLA',
        targetPrice: 180,
        condition: 'CROSSING_DOWN',
      });

      // Simulation of App.tsx quotesByTicker map updating
      const quotesByTicker: Record<string, TickerQuote> = {
        AAPL: {
          ticker: 'AAPL',
          price: 205,
          change: 5,
          changePercent: 2.5,
          high: 206,
          low: 198,
          open: 199,
          previousClose: 200,
          timestamp: 1711901000,
        },
        NVDA: {
          ticker: 'NVDA',
          price: 145, // Not yet at 150
          change: 1,
          changePercent: 0.7,
          high: 146,
          low: 142,
          open: 143,
          previousClose: 144,
          timestamp: 1711901000,
        },
        TSLA: {
          ticker: 'TSLA',
          price: 175, // Below 180 -> triggers!
          change: -10,
          changePercent: -5.4,
          high: 188,
          low: 174,
          open: 186,
          previousClose: 185,
          timestamp: 1711901000,
        },
      };

      // App.tsx loop:
      for (const quote of Object.values(quotesByTicker)) {
        store.getState().evaluateQuote(quote);
      }

      // Check results: AAPL and TSLA triggered, NVDA active
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(2);
      expect(store.getState().lastTriggeredAlertIds).toContain(a1.id);
      expect(store.getState().lastTriggeredAlertIds).toContain(a3.id);
      expect(store.getState().lastTriggeredAlertIds).not.toContain(a2.id);

      // Now NVDA hits 152
      const existingNvda = quotesByTicker.NVDA;
      if (existingNvda) {
        quotesByTicker.NVDA = {
          ...existingNvda,
          price: 152,
          timestamp: 1711901100,
        };
      }

      // Re-run App.tsx loop
      for (const quote of Object.values(quotesByTicker)) {
        store.getState().evaluateQuote(quote);
      }

      // All 3 alerts triggered now
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(3);
      expect(store.getState().lastTriggeredAlertIds).toContain(a2.id);

      // Re-running without price changes does NOT re-trigger any alert
      for (const quote of Object.values(quotesByTicker)) {
        const trig = store.getState().evaluateQuote(quote);
        expect(trig).toHaveLength(0);
      }
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(3);
    });
  });
});
