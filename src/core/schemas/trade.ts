import { z } from 'zod';
import { TickerSymbolSchema } from './market';

export const TradeSideSchema = z.enum(['BUY', 'SELL', 'SHORT', 'COVER']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const TradeStatusSchema = z.enum(['OPEN', 'CLOSED']);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

export const TradeEntrySchema = z.object({
  id: z.string().min(1),
  ticker: TickerSymbolSchema,
  side: TradeSideSchema,
  status: TradeStatusSchema,
  entryTimestamp: z.number().int().positive(), // Unix seconds UTC
  entryPrice: z.number().finite().positive(),
  quantity: z.number().int().positive(),
  exitTimestamp: z.number().int().positive().optional(),
  exitPrice: z.number().finite().positive().optional(),
  stopLossPrice: z.number().finite().positive().optional(),
  takeProfitPrice: z.number().finite().positive().optional(),
  setupTags: z.array(z.string()).default([]),
  notesMarkdown: z.string().default(''),
  linkedAnnotationId: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type TradeEntry = z.infer<typeof TradeEntrySchema>;

export interface JournalSummary {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  totalRealizedPnL: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
}

/**
 * Pure calculation of realized P&L ($) for a trade.
 * For BUY: (exitPrice - entryPrice) * quantity
 * For SHORT: (entryPrice - exitPrice) * quantity
 */
export function calculateTradeRealizedPnL(trade: TradeEntry): number | null {
  if (trade.status !== 'CLOSED' || trade.exitPrice === undefined) {
    return null;
  }
  const multiplier = trade.side === 'BUY' || trade.side === 'COVER' ? 1 : -1;
  const rawPnL = (trade.exitPrice - trade.entryPrice) * trade.quantity * multiplier;
  return Math.round(rawPnL * 100) / 100;
}

/**
 * Pure calculation of percentage return (%) for a trade.
 */
export function calculateTradePnLPercent(trade: TradeEntry): number | null {
  if (trade.status !== 'CLOSED' || trade.exitPrice === undefined) {
    return null;
  }
  const multiplier = trade.side === 'BUY' || trade.side === 'COVER' ? 1 : -1;
  const pct =
    ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * multiplier;
  return Math.round(pct * 100) / 100;
}

/**
 * Pure functional aggregation over trade array to produce executive journal KPIs.
 */
export function calculateJournalSummary(trades: TradeEntry[]): JournalSummary {
  const totalTrades = trades.length;
  let openTrades = 0;
  let closedTrades = 0;
  let winCount = 0;
  let lossCount = 0;
  let totalRealizedPnL = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;

  for (const trade of trades) {
    if (trade.status === 'OPEN') {
      openTrades += 1;
      continue;
    }

    closedTrades += 1;
    const pnl = calculateTradeRealizedPnL(trade);
    if (pnl === null) continue;

    totalRealizedPnL += pnl;

    if (pnl > 0) {
      winCount += 1;
      totalWinPnL += pnl;
    } else if (pnl < 0) {
      lossCount += 1;
      totalLossPnL += Math.abs(pnl);
    }
  }

  const winRatePercent =
    closedTrades > 0
      ? Math.round((winCount / closedTrades) * 100 * 10) / 10
      : 0;

  const averageWin =
    winCount > 0 ? Math.round((totalWinPnL / winCount) * 100) / 100 : 0;

  const averageLoss =
    lossCount > 0 ? Math.round((totalLossPnL / lossCount) * 100) / 100 : 0;

  const profitFactor =
    totalLossPnL > 0
      ? Math.round((totalWinPnL / totalLossPnL) * 100) / 100
      : totalWinPnL > 0
      ? 99.99
      : 0;

  return {
    totalTrades,
    openTrades,
    closedTrades,
    winCount,
    lossCount,
    winRatePercent,
    totalRealizedPnL: Math.round(totalRealizedPnL * 100) / 100,
    averageWin,
    averageLoss,
    profitFactor,
  };
}
