import { describe, expect, it } from 'vitest';
import { InMemoryStorageRepository } from '../repositories/InMemoryStorageRepository';
import {
  TradeEntrySchema,
  calculateJournalSummary,
  calculateTradePnLPercent,
  calculateTradeRealizedPnL,
} from '../schemas/trade';
import { createTradeJournalStore } from '../stores/tradeJournalStore';

describe('Trade Journal Headless Schemas & Pure Analytics (TC-M4-03)', () => {
  it('correctly calculates realized P&L and percentage return for BUY and SHORT trades', () => {
    const buyTrade = TradeEntrySchema.parse({
      id: 't-1',
      ticker: 'nvda',
      side: 'BUY',
      status: 'CLOSED',
      entryTimestamp: 1729728000,
      entryPrice: 120.0,
      quantity: 100,
      exitTimestamp: 1729731600,
      exitPrice: 132.0,
      createdAt: 1729728000,
      updatedAt: 1729731600,
    });

    const buyPnL = calculateTradeRealizedPnL(buyTrade);
    const buyPct = calculateTradePnLPercent(buyTrade);
    expect(buyPnL).toBe(1200); // (132 - 120) * 100
    expect(buyPct).toBe(10); // +10%

    const shortTrade = TradeEntrySchema.parse({
      id: 't-2',
      ticker: 'tsla',
      side: 'SHORT',
      status: 'CLOSED',
      entryTimestamp: 1729728000,
      entryPrice: 250.0,
      quantity: 50,
      exitTimestamp: 1729731600,
      exitPrice: 240.0,
      createdAt: 1729728000,
      updatedAt: 1729731600,
    });

    const shortPnL = calculateTradeRealizedPnL(shortTrade);
    const shortPct = calculateTradePnLPercent(shortTrade);
    expect(shortPnL).toBe(500); // (250 - 240) * 50
    expect(shortPct).toBe(4); // +4%
  });

  it('aggregates executive KPI metrics (Win Rate, Profit Factor, Total Realized P&L)', () => {
    const trades = [
      TradeEntrySchema.parse({
        id: 't-win1',
        ticker: 'AAPL',
        side: 'BUY',
        status: 'CLOSED',
        entryTimestamp: 1729728000,
        entryPrice: 200,
        quantity: 10,
        exitPrice: 220,
        createdAt: 1729728000,
        updatedAt: 1729728000,
      }), // PnL = +$200
      TradeEntrySchema.parse({
        id: 't-win2',
        ticker: 'MSFT',
        side: 'BUY',
        status: 'CLOSED',
        entryTimestamp: 1729728000,
        entryPrice: 400,
        quantity: 5,
        exitPrice: 440,
        createdAt: 1729728000,
        updatedAt: 1729728000,
      }), // PnL = +$200
      TradeEntrySchema.parse({
        id: 't-loss1',
        ticker: 'AMZN',
        side: 'BUY',
        status: 'CLOSED',
        entryTimestamp: 1729728000,
        entryPrice: 200,
        quantity: 10,
        exitPrice: 190,
        createdAt: 1729728000,
        updatedAt: 1729728000,
      }), // PnL = -$100
      TradeEntrySchema.parse({
        id: 't-open',
        ticker: 'NVDA',
        side: 'BUY',
        status: 'OPEN',
        entryTimestamp: 1729728000,
        entryPrice: 130,
        quantity: 20,
        createdAt: 1729728000,
        updatedAt: 1729728000,
      }), // OPEN
    ];

    const summary = calculateJournalSummary(trades);
    expect(summary.totalTrades).toBe(4);
    expect(summary.openTrades).toBe(1);
    expect(summary.closedTrades).toBe(3);
    expect(summary.winCount).toBe(2);
    expect(summary.lossCount).toBe(1);
    expect(summary.winRatePercent).toBe(66.7);
    expect(summary.totalRealizedPnL).toBe(300); // 400 - 100
    expect(summary.profitFactor).toBe(4.0); // 400 / 100
  });

  it('manages trade lifecycle and persists through StorageRepository (TC-M4-04)', async () => {
    const repo = new InMemoryStorageRepository();
    const store = createTradeJournalStore(repo, () => 1729728000);

    const trade = await store.getState().logTrade({
      ticker: 'nvda',
      side: 'BUY',
      entryPrice: 130.5,
      quantity: 50,
      stopLossPrice: 125.0,
      takeProfitPrice: 145.0,
      setupTags: ['Breakout', 'Retest'],
    });

    expect(trade.ticker).toBe('NVDA');
    expect(trade.status).toBe('OPEN');
    expect(store.getState().trades.length).toBe(1);

    // Close trade with profit
    await store.getState().closeTrade(trade.id, 142.0);
    const closed = store.getState().trades[0];
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.exitPrice).toBe(142.0);

    // Verify persistence across new store instance
    const store2 = createTradeJournalStore(repo, () => 1729735000);
    const rehydrated = await store2.getState().hydrate();
    expect(rehydrated.length).toBe(1);
    expect(rehydrated[0]?.id).toBe(trade.id);
    expect(rehydrated[0]?.exitPrice).toBe(142.0);

    // Delete trade
    await store2.getState().deleteTrade(trade.id);
    expect(store2.getState().trades.length).toBe(0);
  });
});
