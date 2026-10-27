import { describe, expect, it } from 'vitest';
import {
  PriceAlertSchema,
  type PriceAlert,
} from '../schemas/alert';
import type { TickerQuote } from '../schemas/market';
import { createAlertStore } from '../stores/alertStore';

function createMockQuote(
  ticker: string,
  price: number,
  timestamp = Math.floor(Date.now() / 1000)
): TickerQuote {
  return {
    ticker,
    price,
    change: 2.5,
    changePercent: 1.2,
    high: price + 3,
    low: price - 3,
    open: price - 1,
    previousClose: price - 2.5,
    timestamp,
  };
}

describe('Milestone 5 Price Alerts Integration Suite', () => {
  describe('Alert Lifecycle & Store State Actions', () => {
    it('creates active alerts with ticker normalization and validated fields', () => {
      const store = createAlertStore();

      const alert1 = store.getState().addAlert({
        ticker: '  aapl  ',
        targetPrice: 235.5,
        condition: 'CROSSING_UP',
        note: 'Breakout above 235 resistance',
      });

      expect(alert1.id).toMatch(/^alert-\d+-[a-z0-9]+$/);
      expect(alert1.ticker).toBe('AAPL');
      expect(alert1.targetPrice).toBe(235.5);
      expect(alert1.condition).toBe('CROSSING_UP');
      expect(alert1.status).toBe('ACTIVE');
      expect(alert1.note).toBe('Breakout above 235 resistance');
      expect(alert1.createdAt).toBeGreaterThan(0);
      expect(alert1.triggeredAt).toBeUndefined();

      expect(store.getState().alerts).toHaveLength(1);
      expect(store.getState().alerts[0]).toEqual(alert1);
    });

    it('rejects invalid alert definitions via domain schema validation', () => {
      const store = createAlertStore();

      // Negative target price
      expect(() =>
        store.getState().addAlert({
          ticker: 'NVDA',
          targetPrice: -10,
          condition: 'CROSSING_UP',
        })
      ).toThrow();

      // Empty ticker
      expect(() =>
        store.getState().addAlert({
          ticker: '',
          targetPrice: 100,
          condition: 'CROSSING_DOWN',
        })
      ).toThrow();
    });

    it('hydrates initial alerts on store creation', () => {
      const preloaded: PriceAlert[] = [
        PriceAlertSchema.parse({
          id: 'preloaded-1',
          ticker: 'MSFT',
          targetPrice: 420,
          condition: 'CROSSING_UP',
          status: 'ACTIVE',
          note: 'Key test',
          createdAt: 1729728000,
        }),
      ];

      const store = createAlertStore(preloaded);
      expect(store.getState().alerts).toHaveLength(1);
      expect(store.getState().alerts[0]?.ticker).toBe('MSFT');
      expect(store.getState().alerts[0]?.id).toBe('preloaded-1');
    });
  });

  describe('Real-Time Quote Evaluation & Trigger Mechanics', () => {
    it('evaluates CROSSING_UP alerts and records trigger timestamps', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 140.0,
        condition: 'CROSSING_UP',
        note: 'All-time-high breakout',
      });

      const t1 = 1711901000;
      // Below target price -> no trigger
      const r1 = store.getState().evaluateQuote(createMockQuote('NVDA', 139.5, t1));
      expect(r1).toHaveLength(0);
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);
      expect(store.getState().alerts[0]?.status).toBe('ACTIVE');

      // Different ticker above price -> no trigger for NVDA alert
      const rOther = store.getState().evaluateQuote(createMockQuote('AAPL', 145.0, t1 + 10));
      expect(rOther).toHaveLength(0);
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);

      // Meets or exceeds target price -> triggers alert
      const t2 = 1711901100;
      const r2 = store.getState().evaluateQuote(createMockQuote('NVDA', 140.25, t2));
      expect(r2).toHaveLength(1);
      expect(r2[0]?.id).toBe(alert.id);
      expect(r2[0]?.status).toBe('TRIGGERED');
      expect(r2[0]?.triggeredAt).toBe(t2);

      // Store state reflects TRIGGERED and banner ID
      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);
      const updatedAlert = store.getState().alerts.find((a) => a.id === alert.id);
      expect(updatedAlert?.status).toBe('TRIGGERED');
      expect(updatedAlert?.triggeredAt).toBe(t2);

      // Subsequent quotes do not re-trigger an already TRIGGERED alert
      const t3 = 1711901200;
      const r3 = store.getState().evaluateQuote(createMockQuote('NVDA', 142.0, t3));
      expect(r3).toHaveLength(0);
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(1);
    });

    it('evaluates CROSSING_DOWN alerts correctly when price drops', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'TSLA',
        targetPrice: 220.0,
        condition: 'CROSSING_DOWN',
        note: 'Support breakdown stop',
      });

      const t1 = 1711902000;
      // Above target price -> no trigger
      expect(
        store.getState().evaluateQuote(createMockQuote('TSLA', 225.0, t1))
      ).toHaveLength(0);
      expect(store.getState().alerts[0]?.status).toBe('ACTIVE');

      // Drops below target price -> triggers
      const t2 = 1711902100;
      const triggered = store
        .getState()
        .evaluateQuote(createMockQuote('TSLA', 219.75, t2));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
      expect(triggered[0]?.status).toBe('TRIGGERED');
      expect(triggered[0]?.triggeredAt).toBe(t2);
      expect(store.getState().lastTriggeredAlertIds).toEqual([alert.id]);
    });
  });

  describe('Multi-Symbol Watchlist Quote Stream Simulation', () => {
    it('evaluates a multi-symbol portfolio quote batch seamlessly (as in App.tsx)', () => {
      const store = createAlertStore();

      // Configure alerts across 4 symbols
      const aaplAlert = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 230,
        condition: 'CROSSING_UP',
      });
      const nvdaAlert = store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 145,
        condition: 'CROSSING_UP',
      });
      const msftAlert = store.getState().addAlert({
        ticker: 'MSFT',
        targetPrice: 400,
        condition: 'CROSSING_DOWN',
      });
      const tslaAlert = store.getState().addAlert({
        ticker: 'TSLA',
        targetPrice: 210,
        condition: 'CROSSING_DOWN',
      });

      expect(store.getState().alerts).toHaveLength(4);

      // Batch 1: All prices within bounds
      const quotesBatch1: Record<string, TickerQuote> = {
        AAPL: createMockQuote('AAPL', 225),
        NVDA: createMockQuote('NVDA', 140),
        MSFT: createMockQuote('MSFT', 415),
        TSLA: createMockQuote('TSLA', 220),
      };

      for (const quote of Object.values(quotesBatch1)) {
        store.getState().evaluateQuote(quote);
      }
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);

      // Batch 2: AAPL and NVDA cross above their thresholds
      const quotesBatch2: Record<string, TickerQuote> = {
        AAPL: createMockQuote('AAPL', 231.5),
        NVDA: createMockQuote('NVDA', 145.2),
        MSFT: createMockQuote('MSFT', 405),
        TSLA: createMockQuote('TSLA', 218),
      };

      for (const quote of Object.values(quotesBatch2)) {
        store.getState().evaluateQuote(quote);
      }

      expect(store.getState().lastTriggeredAlertIds).toHaveLength(2);
      expect(store.getState().lastTriggeredAlertIds).toContain(aaplAlert.id);
      expect(store.getState().lastTriggeredAlertIds).toContain(nvdaAlert.id);

      // Batch 3: MSFT drops below 400
      const quotesBatch3: Record<string, TickerQuote> = {
        AAPL: createMockQuote('AAPL', 232),
        NVDA: createMockQuote('NVDA', 146),
        MSFT: createMockQuote('MSFT', 399.5),
        TSLA: createMockQuote('TSLA', 215),
      };

      for (const quote of Object.values(quotesBatch3)) {
        store.getState().evaluateQuote(quote);
      }

      expect(store.getState().lastTriggeredAlertIds).toHaveLength(3);
      expect(store.getState().lastTriggeredAlertIds).toContain(msftAlert.id);

      // Batch 4: TSLA drops below 210
      const quotesBatch4: Record<string, TickerQuote> = {
        TSLA: createMockQuote('TSLA', 208.5),
      };

      for (const quote of Object.values(quotesBatch4)) {
        store.getState().evaluateQuote(quote);
      }

      expect(store.getState().lastTriggeredAlertIds).toHaveLength(4);
      expect(store.getState().lastTriggeredAlertIds).toContain(tslaAlert.id);

      // Verify all 4 are now in TRIGGERED status
      const alerts = store.getState().alerts;
      expect(alerts.every((a) => a.status === 'TRIGGERED')).toBe(true);
    });
  });

  describe('Alert Management: Dismiss, Rearm, Clear Banner, and Delete', () => {
    it('handles dismiss and rearm flow with re-triggering capability', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'AMD',
        targetPrice: 175,
        condition: 'CROSSING_UP',
      });

      // Trigger the alert
      store.getState().evaluateQuote(createMockQuote('AMD', 176));
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);

      // User dismisses the alert
      store.getState().dismissAlert(alert.id);
      expect(store.getState().alerts[0]?.status).toBe('DISMISSED');
      expect(store.getState().lastTriggeredAlertIds).not.toContain(alert.id);

      // While dismissed, quotes cannot trigger it
      store.getState().evaluateQuote(createMockQuote('AMD', 180));
      expect(store.getState().alerts[0]?.status).toBe('DISMISSED');

      // User re-arms the alert
      store.getState().rearmAlert(alert.id);
      expect(store.getState().alerts[0]?.status).toBe('ACTIVE');
      expect(store.getState().alerts[0]?.triggeredAt).toBeUndefined();

      // Quote triggers it once again
      const retriggered = store
        .getState()
        .evaluateQuote(createMockQuote('AMD', 182, 1711905000));
      expect(retriggered).toHaveLength(1);
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
      expect(store.getState().alerts[0]?.triggeredAt).toBe(1711905000);
      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);
    });

    it('clears triggered banner independently of alert statuses', () => {
      const store = createAlertStore();
      const a1 = store.getState().addAlert({
        ticker: 'AMZN',
        targetPrice: 185,
        condition: 'CROSSING_UP',
      });
      const a2 = store.getState().addAlert({
        ticker: 'GOOGL',
        targetPrice: 165,
        condition: 'CROSSING_UP',
      });

      store.getState().evaluateQuote(createMockQuote('AMZN', 190));
      store.getState().evaluateQuote(createMockQuote('GOOGL', 170));
      expect(store.getState().lastTriggeredAlertIds).toEqual([a1.id, a2.id]);

      // Clear banner
      store.getState().clearTriggeredBanner();
      expect(store.getState().lastTriggeredAlertIds).toEqual([]);

      // Alerts remain TRIGGERED
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
      expect(store.getState().alerts[1]?.status).toBe('TRIGGERED');
    });

    it('removes alert completely from alerts and banner list', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'META',
        targetPrice: 500,
        condition: 'CROSSING_UP',
      });

      store.getState().evaluateQuote(createMockQuote('META', 510));
      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);

      store.getState().removeAlert(alert.id);
      expect(store.getState().alerts).toHaveLength(0);
      expect(store.getState().lastTriggeredAlertIds).not.toContain(alert.id);
    });
  });

  describe('Headless Core Invariant & Pure Architecture Verification', () => {
    it('operates without window/document/DOM globals and supports pure execution', () => {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');

      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'SPY',
        targetPrice: 520,
        condition: 'CROSSING_UP',
      });

      const triggered = store
        .getState()
        .evaluateQuote(createMockQuote('SPY', 525));
      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
      expect(triggered[0]?.ticker).toBe('SPY');
    });
  });
});
