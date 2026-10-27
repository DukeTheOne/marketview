import { describe, expect, it } from 'vitest';
import {
  PriceAlertSchema,
  shouldTriggerAlert,
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
    change: 1.5,
    changePercent: 0.8,
    high: price + 2,
    low: price - 2,
    open: price - 1,
    previousClose: price - 1.5,
    timestamp,
  };
}

describe('PriceAlertSchema & shouldTriggerAlert', () => {
  it('validates a well-formed PriceAlert and applies defaults', () => {
    const parsed = PriceAlertSchema.parse({
      id: 'alert-1',
      ticker: ' nvda ',
      targetPrice: 135.5,
      condition: 'CROSSING_UP',
      createdAt: 1711800000,
    });

    expect(parsed.ticker).toBe('NVDA');
    expect(parsed.status).toBe('ACTIVE');
    expect(parsed.note).toBe('');
    expect(parsed.triggeredAt).toBeUndefined();
  });

  it('evaluates CROSSING_UP and CROSSING_DOWN only when status is ACTIVE', () => {
    const upAlert: PriceAlert = PriceAlertSchema.parse({
      id: 'alert-up',
      ticker: 'AAPL',
      targetPrice: 200,
      condition: 'CROSSING_UP',
      status: 'ACTIVE',
      note: 'Breakout above 200',
      createdAt: 1711800000,
    });

    expect(shouldTriggerAlert(upAlert, 199.99)).toBe(false);
    expect(shouldTriggerAlert(upAlert, 200)).toBe(true);
    expect(shouldTriggerAlert(upAlert, 205.5)).toBe(true);

    const downAlert: PriceAlert = PriceAlertSchema.parse({
      id: 'alert-down',
      ticker: 'AAPL',
      targetPrice: 180,
      condition: 'CROSSING_DOWN',
      status: 'ACTIVE',
      note: 'Support breakdown',
      createdAt: 1711800000,
    });

    expect(shouldTriggerAlert(downAlert, 180.01)).toBe(false);
    expect(shouldTriggerAlert(downAlert, 180)).toBe(true);
    expect(shouldTriggerAlert(downAlert, 175)).toBe(true);

    const triggeredAlert: PriceAlert = {
      ...upAlert,
      status: 'TRIGGERED',
      triggeredAt: 1711850000,
    };
    expect(shouldTriggerAlert(triggeredAlert, 250)).toBe(false);

    const dismissedAlert: PriceAlert = {
      ...downAlert,
      status: 'DISMISSED',
    };
    expect(shouldTriggerAlert(dismissedAlert, 150)).toBe(false);
  });
});

describe('createAlertStore', () => {
  it('adds alerts normalized by ticker symbol and filters by ticker', () => {
    const store = createAlertStore();
    const a1 = store.getState().addAlert({
      ticker: 'aapl',
      targetPrice: 225,
      condition: 'CROSSING_UP',
      note: 'ATH test',
    });
    store.getState().addAlert({
      ticker: 'msft',
      targetPrice: 410,
      condition: 'CROSSING_DOWN',
    });

    expect(a1.ticker).toBe('AAPL');
    expect(a1.status).toBe('ACTIVE');
    expect(a1.note).toBe('ATH test');
    expect(store.getState().alerts).toHaveLength(2);
    expect(store.getState().getAlertsForTicker(' aapl ')).toHaveLength(1);
    expect(store.getState().getAlertsForTicker('MSFT')).toHaveLength(1);
  });

  it('triggers CROSSING_UP and CROSSING_DOWN alerts on evaluateQuote', () => {
    const store = createAlertStore();
    const upAlert = store.getState().addAlert({
      ticker: 'NVDA',
      targetPrice: 140,
      condition: 'CROSSING_UP',
      note: 'Breakout level',
    });
    const downAlert = store.getState().addAlert({
      ticker: 'NVDA',
      targetPrice: 120,
      condition: 'CROSSING_DOWN',
      note: 'Stop level',
    });
    store.getState().addAlert({
      ticker: 'AAPL',
      targetPrice: 100,
      condition: 'CROSSING_UP',
    });

    // Price in between thresholds triggers nothing
    const noTrigger = store
      .getState()
      .evaluateQuote(makeQuote('NVDA', 130, 1711900100));
    expect(noTrigger).toHaveLength(0);
    expect(store.getState().lastTriggeredAlertIds).toEqual([]);

    // Price crosses above 140 -> triggers upAlert
    const triggeredUp = store
      .getState()
      .evaluateQuote(makeQuote('NVDA', 141.25, 1711900200));
    expect(triggeredUp).toHaveLength(1);
    expect(triggeredUp[0]?.id).toBe(upAlert.id);
    expect(triggeredUp[0]?.status).toBe('TRIGGERED');
    expect(triggeredUp[0]?.triggeredAt).toBe(1711900200);
    expect(store.getState().lastTriggeredAlertIds).toEqual([upAlert.id]);

    // Subsequent quote above 140 does not re-trigger already TRIGGERED alert
    const repeatUp = store
      .getState()
      .evaluateQuote(makeQuote('NVDA', 145, 1711900300));
    expect(repeatUp).toHaveLength(0);

    // Price drops to 119.5 -> triggers downAlert
    const triggeredDown = store
      .getState()
      .evaluateQuote(makeQuote('NVDA', 119.5, 1711900400));
    expect(triggeredDown).toHaveLength(1);
    expect(triggeredDown[0]?.id).toBe(downAlert.id);
    expect(triggeredDown[0]?.status).toBe('TRIGGERED');
    expect(triggeredDown[0]?.triggeredAt).toBe(1711900400);
    expect(store.getState().lastTriggeredAlertIds).toEqual([
      upAlert.id,
      downAlert.id,
    ]);
  });

  it('supports dismissAlert, rearmAlert, clearTriggeredBanner, and removeAlert', () => {
    const store = createAlertStore();
    const alert = store.getState().addAlert({
      ticker: 'TSLA',
      targetPrice: 250,
      condition: 'CROSSING_UP',
    });

    store.getState().evaluateQuote(makeQuote('TSLA', 255, 1711900500));
    expect(store.getState().lastTriggeredAlertIds).toContain(alert.id);

    // Dismissing sets status to DISMISSED and removes from banner
    store.getState().dismissAlert(alert.id);
    const afterDismiss = store
      .getState()
      .alerts.find((a) => a.id === alert.id);
    expect(afterDismiss?.status).toBe('DISMISSED');
    expect(store.getState().lastTriggeredAlertIds).toEqual([]);

    // Rearming resets status to ACTIVE and clears triggeredAt so it can trigger again
    store.getState().rearmAlert(alert.id);
    const afterRearm = store.getState().alerts.find((a) => a.id === alert.id);
    expect(afterRearm?.status).toBe('ACTIVE');
    expect(afterRearm?.triggeredAt).toBeUndefined();

    // Trigger again after re-arming
    const retriggered = store
      .getState()
      .evaluateQuote(makeQuote('TSLA', 260, 1711900600));
    expect(retriggered).toHaveLength(1);
    expect(store.getState().lastTriggeredAlertIds).toEqual([alert.id]);

    // Clear banner without changing alert status
    store.getState().clearTriggeredBanner();
    expect(store.getState().lastTriggeredAlertIds).toEqual([]);

    // Remove alert completely
    store.getState().removeAlert(alert.id);
    expect(store.getState().alerts).toHaveLength(0);
  });
});
