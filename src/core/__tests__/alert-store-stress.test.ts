import { describe, expect, it } from 'vitest';
import {
  PriceAlertSchema,
  type PriceAlert,
} from '../schemas/alert';
import type { TickerQuote } from '../schemas/market';
import { createAlertStore } from '../stores/alertStore';

function makeQuote(
  ticker: string,
  price: number,
  timestamp = 1711900000
): TickerQuote {
  return {
    ticker,
    price,
    change: 1.0,
    changePercent: 0.5,
    high: price + 1,
    low: price - 1,
    open: price,
    previousClose: price - 1,
    timestamp,
  };
}

describe('Challenger 2: Price Alert Empirical Stress Suite', () => {
  // =========================================================================
  // 1. HIGH-FREQUENCY QUOTE STREAMS (RAPID TICKS ACROSS MULTIPLE SYMBOLS)
  // =========================================================================
  describe('High-Frequency Quote Streams & Throughput Scaling', () => {
    it('evaluates 10,000 rapid ticks across 20 symbols with 100 concurrent alerts without dropping or duplicating triggers', () => {
      const store = createAlertStore();
      const tickers = [
        'AAPL', 'NVDA', 'MSFT', 'TSLA', 'GOOGL',
        'AMZN', 'META', 'SPY',  'QQQ',  'AMD',
        'INTC', 'NFLX', 'BABA', 'DIS',  'BA',
        'JPM',  'V',    'WMT',  'PG',   'XOM',
      ];

      // Create 100 alerts (5 per ticker: 3 CROSSING_UP, 2 CROSSING_DOWN)
      const alertsByTicker = new Map<string, PriceAlert[]>();
      for (const ticker of tickers) {
        const tAlerts: PriceAlert[] = [];
        tAlerts.push(
          store.getState().addAlert({
            ticker,
            targetPrice: 150,
            condition: 'CROSSING_UP',
            note: `${ticker} 150 UP`,
          })
        );
        tAlerts.push(
          store.getState().addAlert({
            ticker,
            targetPrice: 200,
            condition: 'CROSSING_UP',
            note: `${ticker} 200 UP`,
          })
        );
        tAlerts.push(
          store.getState().addAlert({
            ticker,
            targetPrice: 250,
            condition: 'CROSSING_UP',
            note: `${ticker} 250 UP`,
          })
        );
        tAlerts.push(
          store.getState().addAlert({
            ticker,
            targetPrice: 80,
            condition: 'CROSSING_DOWN',
            note: `${ticker} 80 DOWN`,
          })
        );
        tAlerts.push(
          store.getState().addAlert({
            ticker,
            targetPrice: 50,
            condition: 'CROSSING_DOWN',
            note: `${ticker} 50 DOWN`,
          })
        );
        alertsByTicker.set(ticker, tAlerts);
      }

      expect(store.getState().alerts).toHaveLength(100);

      // Stream 10,000 ticks
      const startMs = Date.now();
      let totalTriggeredCount = 0;
      let timestamp = 1711900000;

      for (let i = 0; i < 10000; i++) {
        const ticker = tickers[i % tickers.length]!;
        // Deterministic price oscillation between 30 and 300
        const price = 30 + ((i * 17) % 271);
        timestamp += 1;

        const triggered = store.getState().evaluateQuote({
          ticker,
          price,
          change: 0,
          changePercent: 0,
          high: price,
          low: price,
          open: price,
          previousClose: price,
          timestamp,
        });

        totalTriggeredCount += triggered.length;
      }

      const elapsedMs = Date.now() - startMs;

      // Invariants check
      const state = store.getState();
      const bannerIds = state.lastTriggeredAlertIds;

      // 1. lastTriggeredAlertIds must have NO duplicates
      const uniqueBannerIds = new Set(bannerIds);
      expect(uniqueBannerIds.size).toBe(bannerIds.length);

      // 2. Total triggered returned across ticks must match banner length
      expect(totalTriggeredCount).toBe(bannerIds.length);

      // 3. Every alert in banner must be in TRIGGERED state
      for (const id of bannerIds) {
        const found = state.alerts.find((a) => a.id === id);
        expect(found).toBeDefined();
        expect(found?.status).toBe('TRIGGERED');
        expect(found?.triggeredAt).toBeGreaterThan(0);
      }

      // 4. Performance constraint: 10,000 evaluations should execute within 1500ms
      expect(elapsedMs).toBeLessThan(1500);
    });
  });

  // =========================================================================
  // 2. PRICE GAP JUMPS (OVERNIGHT GAPS, FLASH CRASHES, BOUNDARY PRECISION)
  // =========================================================================
  describe('Price Gap Jumps & Extreme Boundary Precision', () => {
    it('triggers CROSSING_UP on massive +100% price gap jump without hitting intermediate prices', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 150,
        condition: 'CROSSING_UP',
      });

      // Price gaps from 100 to 220 directly
      const quoteGap = makeQuote('NVDA', 220, 1711900100);
      const triggered = store.getState().evaluateQuote(quoteGap);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
      expect(triggered[0]?.status).toBe('TRIGGERED');
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);
    });

    it('triggers CROSSING_DOWN on sudden -70% flash crash gap jump', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'TSLA',
        targetPrice: 200,
        condition: 'CROSSING_DOWN',
      });

      // Price gaps from 250 to 75 in one tick
      const quoteGap = makeQuote('TSLA', 75, 1711900200);
      const triggered = store.getState().evaluateQuote(quoteGap);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]?.id).toBe(alert.id);
      expect(triggered[0]?.status).toBe('TRIGGERED');
      expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);
    });

    it('evaluates exact float boundaries with sub-penny precision', () => {
      const store = createAlertStore();
      const alertUp = store.getState().addAlert({
        ticker: 'SPY',
        targetPrice: 520.125,
        condition: 'CROSSING_UP',
      });
      const alertDown = store.getState().addAlert({
        ticker: 'QQQ',
        targetPrice: 440.875,
        condition: 'CROSSING_DOWN',
      });

      // Just below 520.125
      expect(
        store.getState().evaluateQuote(makeQuote('SPY', 520.124999))
      ).toHaveLength(0);

      // Exactly 520.125
      const trigUp = store
        .getState()
        .evaluateQuote(makeQuote('SPY', 520.125));
      expect(trigUp).toHaveLength(1);
      expect(trigUp[0]?.id).toBe(alertUp.id);

      // Just above 440.875
      expect(
        store.getState().evaluateQuote(makeQuote('QQQ', 440.875001))
      ).toHaveLength(0);

      // Exactly 440.875
      const trigDown = store
        .getState()
        .evaluateQuote(makeQuote('QQQ', 440.875));
      expect(trigDown).toHaveLength(1);
      expect(trigDown[0]?.id).toBe(alertDown.id);
    });

    it('handles extreme price magnitudes (BRK.A $650,000 down to penny stocks $0.005)', () => {
      const store = createAlertStore();
      const brkAlert = store.getState().addAlert({
        ticker: 'BRK.A',
        targetPrice: 650000,
        condition: 'CROSSING_UP',
      });
      const pennyAlert = store.getState().addAlert({
        ticker: 'PENNY',
        targetPrice: 0.005,
        condition: 'CROSSING_DOWN',
      });

      expect(
        store.getState().evaluateQuote(makeQuote('BRK.A', 650000.5))
      ).toHaveLength(1);
      expect(
        store.getState().evaluateQuote(makeQuote('PENNY', 0.0049))
      ).toHaveLength(1);

      expect(store.getState().lastTriggeredAlertIds).toEqual([
        brkAlert.id,
        pennyAlert.id,
      ]);
    });
  });

  // =========================================================================
  // 3. SINGLE-TRIGGER GUARANTEE UNDER SUSTAINED MARKET VOLATILITY
  // =========================================================================
  describe('Single-Trigger Invariant Under Sustained Market Volatility', () => {
    it('never re-triggers an alert across 500 subsequent violent oscillations without explicit rearm', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 180,
        condition: 'CROSSING_UP',
      });

      // Tick 1 triggers alert
      const firstTrigger = store
        .getState()
        .evaluateQuote(makeQuote('AAPL', 181, 1711900001));
      expect(firstTrigger).toHaveLength(1);
      expect(store.getState().lastTriggeredAlertIds).toEqual([alert.id]);

      // 500 subsequent ticks oscillate above and below 180
      for (let i = 2; i <= 500; i++) {
        const oscillatingPrice = i % 2 === 0 ? 195 : 165;
        const result = store
          .getState()
          .evaluateQuote(makeQuote('AAPL', oscillatingPrice, 1711900000 + i));
        expect(result).toHaveLength(0);
        // Banner array should not grow
        expect(store.getState().lastTriggeredAlertIds).toHaveLength(1);
      }

      // Status remains TRIGGERED
      expect(store.getState().alerts[0]?.status).toBe('TRIGGERED');
      expect(store.getState().alerts[0]?.triggeredAt).toBe(1711900001);

      // Now rearm the alert
      store.getState().rearmAlert(alert.id);
      expect(store.getState().alerts[0]?.status).toBe('ACTIVE');
      expect(store.getState().alerts[0]?.triggeredAt).toBeUndefined();
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);

      // Next tick above 180 triggers it again
      const secondTrigger = store
        .getState()
        .evaluateQuote(makeQuote('AAPL', 182, 1711900600));
      expect(secondTrigger).toHaveLength(1);
      expect(secondTrigger[0]?.triggeredAt).toBe(1711900600);
      expect(store.getState().lastTriggeredAlertIds).toEqual([alert.id]);
    });
  });

  // =========================================================================
  // 4. DISMISS, REARM, AND DELETE RACE CONDITIONS & INTERLEAVING ACTIONS
  // =========================================================================
  describe('Lifecycle Interleaving & Race Conditions', () => {
    it('handles non-existent alert IDs safely across all mutating actions', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'MSFT',
        targetPrice: 400,
        condition: 'CROSSING_UP',
      });

      // Mutating ghost IDs does not throw or corrupt state
      expect(() => store.getState().dismissAlert('non-existent-id')).not.toThrow();
      expect(() => store.getState().rearmAlert('non-existent-id')).not.toThrow();
      expect(() => store.getState().removeAlert('non-existent-id')).not.toThrow();

      expect(store.getState().alerts).toHaveLength(1);
      expect(store.getState().alerts[0]?.id).toBe(alert.id);
    });

    it('ensures dismissed alert cannot trigger even on explosive price spike', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'AMD',
        targetPrice: 150,
        condition: 'CROSSING_UP',
      });

      // User dismisses alert before quote arrives
      store.getState().dismissAlert(alert.id);
      expect(store.getState().alerts[0]?.status).toBe('DISMISSED');

      // Price shoots to 250
      const triggered = store
        .getState()
        .evaluateQuote(makeQuote('AMD', 250));
      expect(triggered).toHaveLength(0);
      expect(store.getState().alerts[0]?.status).toBe('DISMISSED');
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);
    });

    it('cleans up banner when a triggered alert is dismissed or deleted', () => {
      const store = createAlertStore();
      const a1 = store.getState().addAlert({
        ticker: 'T1',
        targetPrice: 100,
        condition: 'CROSSING_UP',
      });
      const a2 = store.getState().addAlert({
        ticker: 'T2',
        targetPrice: 100,
        condition: 'CROSSING_UP',
      });

      store.getState().evaluateQuote(makeQuote('T1', 110));
      store.getState().evaluateQuote(makeQuote('T2', 110));
      expect(store.getState().lastTriggeredAlertIds).toEqual([a1.id, a2.id]);

      // Dismiss a1 -> only a2 remains in banner
      store.getState().dismissAlert(a1.id);
      expect(store.getState().lastTriggeredAlertIds).toEqual([a2.id]);

      // Delete a2 -> banner is empty
      store.getState().removeAlert(a2.id);
      expect(store.getState().lastTriggeredAlertIds).toEqual([]);
      expect(store.getState().alerts).toHaveLength(1);
      expect(store.getState().alerts[0]?.id).toBe(a1.id);
    });

    it('maintains state consistency under rapid random interleaving of lifecycle events', () => {
      const store = createAlertStore();
      const activeIds: string[] = [];

      for (let cycle = 0; cycle < 50; cycle++) {
        // Step 1: Add alert
        const alert = store.getState().addAlert({
          ticker: 'SYM',
          targetPrice: 100 + cycle,
          condition: cycle % 2 === 0 ? 'CROSSING_UP' : 'CROSSING_DOWN',
        });
        activeIds.push(alert.id);

        // Step 2: Tick quote that may trigger
        store.getState().evaluateQuote(makeQuote('SYM', 150));

        // Step 3: Dismiss odd IDs
        if (cycle % 3 === 0 && activeIds.length > 0) {
          const targetId = activeIds[0]!;
          store.getState().dismissAlert(targetId);
        }

        // Step 4: Rearm even IDs
        if (cycle % 4 === 0 && activeIds.length > 1) {
          const targetId = activeIds[1]!;
          store.getState().rearmAlert(targetId);
        }

        // Step 5: Clear banner periodically
        if (cycle % 5 === 0) {
          store.getState().clearTriggeredBanner();
        }

        // Step 6: Delete oldest ID periodically
        if (cycle % 7 === 0 && activeIds.length > 2) {
          const removeId = activeIds.shift()!;
          store.getState().removeAlert(removeId);
        }
      }

      // Post-loop invariants
      const finalState = store.getState();
      for (const a of finalState.alerts) {
        expect(() => PriceAlertSchema.parse(a)).not.toThrow();
      }

      // All banner IDs must exist in alerts
      for (const bId of finalState.lastTriggeredAlertIds) {
        expect(finalState.alerts.some((a) => a.id === bId)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 5. BANNER STATE INDEPENDENCE (clearTriggeredBanner DOES NOT MUTATE ALERTS)
  // =========================================================================
  describe('Banner State Independence', () => {
    it('clears banner completely without mutating alert status or trigger timestamps', () => {
      const store = createAlertStore();
      const a1 = store.getState().addAlert({
        ticker: 'AMZN',
        targetPrice: 190,
        condition: 'CROSSING_UP',
      });
      const a2 = store.getState().addAlert({
        ticker: 'GOOGL',
        targetPrice: 170,
        condition: 'CROSSING_UP',
      });

      const t1 = 1711900100;
      store.getState().evaluateQuote(makeQuote('AMZN', 195, t1));
      store.getState().evaluateQuote(makeQuote('GOOGL', 175, t1));

      expect(store.getState().lastTriggeredAlertIds).toEqual([a1.id, a2.id]);
      expect(store.getState().alerts.every((a) => a.status === 'TRIGGERED')).toBe(true);

      // User clears banner
      store.getState().clearTriggeredBanner();
      expect(store.getState().lastTriggeredAlertIds).toEqual([]);

      // Invariant: alerts are strictly still TRIGGERED with their timestamps preserved
      const amzn = store.getState().alerts.find((a) => a.id === a1.id);
      const googl = store.getState().alerts.find((a) => a.id === a2.id);
      expect(amzn?.status).toBe('TRIGGERED');
      expect(amzn?.triggeredAt).toBe(t1);
      expect(googl?.status).toBe('TRIGGERED');
      expect(googl?.triggeredAt).toBe(t1);

      // Subsequent quotes do not re-trigger them into banner
      store.getState().evaluateQuote(makeQuote('AMZN', 200, t1 + 50));
      expect(store.getState().lastTriggeredAlertIds).toEqual([]);
    });
  });

  // =========================================================================
  // 6. MALFORMED QUOTE RESILIENCE & BOUNDARY STRESS
  // =========================================================================
  describe('Malformed Quote Resilience & Input Boundary Validation', () => {
    it('returns empty array without throwing when quote price is NaN', () => {
      const store = createAlertStore();
      store.getState().addAlert({
        ticker: 'NVDA',
        targetPrice: 130,
        condition: 'CROSSING_UP',
      });

      const result = store.getState().evaluateQuote(makeQuote('NVDA', NaN));
      expect(result).toHaveLength(0);
      expect(store.getState().alerts[0]?.status).toBe('ACTIVE');
      expect(store.getState().lastTriggeredAlertIds).toHaveLength(0);
    });

    it('normalizes lowercase and whitespace in quote ticker to match active alert', () => {
      const store = createAlertStore();
      const alert = store.getState().addAlert({
        ticker: 'AAPL',
        targetPrice: 200,
        condition: 'CROSSING_UP',
      });

      // Incoming quote has lowercase with whitespace
      const result = store.getState().evaluateQuote(
        makeQuote('  aapl  ', 205)
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(alert.id);
      expect(result[0]?.status).toBe('TRIGGERED');
    });

    it('rejects quote with empty ticker string via ZodError', () => {
      const store = createAlertStore();
      store.getState().addAlert({
        ticker: 'MSFT',
        targetPrice: 400,
        condition: 'CROSSING_UP',
      });

      expect(() =>
        store.getState().evaluateQuote(makeQuote('', 410))
      ).toThrow();
    });

    it('rejects quote with ticker exceeding 12 characters via ZodError', () => {
      const store = createAlertStore();
      expect(() =>
        store.getState().evaluateQuote(makeQuote('TOOLONGTICKERNAME', 100))
      ).toThrow();
    });

    it('rejects alert creation with zero or negative target prices', () => {
      const store = createAlertStore();

      expect(() =>
        store.getState().addAlert({
          ticker: 'NVDA',
          targetPrice: 0,
          condition: 'CROSSING_UP',
        })
      ).toThrow();

      expect(() =>
        store.getState().addAlert({
          ticker: 'NVDA',
          targetPrice: -50.5,
          condition: 'CROSSING_DOWN',
        })
      ).toThrow();

      expect(() =>
        store.getState().addAlert({
          ticker: 'NVDA',
          targetPrice: NaN,
          condition: 'CROSSING_UP',
        })
      ).toThrow();
    });

    it('ensures evaluateQuote on empty store returns empty array gracefully', () => {
      const store = createAlertStore();
      const result = store.getState().evaluateQuote(makeQuote('AAPL', 200));
      expect(result).toEqual([]);
      expect(store.getState().lastTriggeredAlertIds).toEqual([]);
    });
  });
});
