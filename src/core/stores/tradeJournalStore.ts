import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageRepository } from '../repositories/StorageRepository';
import { TickerSymbolSchema } from '../schemas/market';
import {
  TradeEntrySchema,
  calculateJournalSummary,
  type JournalSummary,
  type TradeEntry,
  type TradeSide,
  type TradeStatus,
} from '../schemas/trade';

export interface TradeJournalState {
  trades: TradeEntry[];
  selectedTradeId: string | null;
  filterStatus: 'ALL' | 'OPEN' | 'CLOSED';
  isDrawerOpen: boolean;
  isHydrated: boolean;

  hydrate: (ticker?: string) => Promise<TradeEntry[]>;
  logTrade: (input: {
    ticker: string;
    side: TradeSide;
    entryPrice: number;
    quantity: number;
    entryTimestamp?: number;
    status?: TradeStatus;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    setupTags?: string[];
    notesMarkdown?: string;
    linkedAnnotationId?: string;
  }) => Promise<TradeEntry>;
  closeTrade: (
    id: string,
    exitPrice: number,
    exitTimestamp?: number
  ) => Promise<void>;
  updateTrade: (
    id: string,
    updates: Partial<
      Pick<
        TradeEntry,
        | 'stopLossPrice'
        | 'takeProfitPrice'
        | 'notesMarkdown'
        | 'setupTags'
        | 'linkedAnnotationId'
      >
    >
  ) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  setFilterStatus: (filter: 'ALL' | 'OPEN' | 'CLOSED') => void;
  toggleDrawer: (open?: boolean) => void;
  selectTrade: (id: string | null) => void;
  getTradesForTicker: (ticker: string) => TradeEntry[];
  getSummary: () => JournalSummary;
}

export type TradeJournalStore = StoreApi<TradeJournalState>;

/**
 * Headless Zustand store factory for trade execution logging and portfolio journal analytics.
 */
export function createTradeJournalStore(
  repository: StorageRepository,
  nowSecProvider: () => number = () => Math.floor(Date.now() / 1000)
): TradeJournalStore {
  return createStore<TradeJournalState>((set, get) => ({
    trades: [],
    selectedTradeId: null,
    filterStatus: 'ALL',
    isDrawerOpen: false,
    isHydrated: false,

    hydrate: async (ticker?: string) => {
      const stored = await repository.getTrades(ticker);
      set({ trades: stored, isHydrated: true });
      return stored;
    },

    logTrade: async (input) => {
      const nowSec = nowSecProvider();
      const ticker = TickerSymbolSchema.parse(input.ticker);
      const id = `trade-${nowSec}-${Math.random().toString(36).slice(2, 7)}`;

      const newTrade = TradeEntrySchema.parse({
        id,
        ticker,
        side: input.side,
        status: input.status ?? 'OPEN',
        entryTimestamp: input.entryTimestamp ?? nowSec,
        entryPrice: input.entryPrice,
        quantity: input.quantity,
        stopLossPrice: input.stopLossPrice,
        takeProfitPrice: input.takeProfitPrice,
        setupTags: input.setupTags ?? [],
        notesMarkdown: input.notesMarkdown ?? '',
        linkedAnnotationId: input.linkedAnnotationId,
        createdAt: nowSec,
        updatedAt: nowSec,
      });

      const next = [newTrade, ...get().trades];
      await repository.saveTrades(next);
      set({
        trades: next,
        selectedTradeId: newTrade.id,
      });
      return newTrade;
    },

    closeTrade: async (id, exitPrice, exitTimestamp) => {
      const nowSec = nowSecProvider();
      const current = get().trades;
      const next = current.map((t) => {
        if (t.id !== id) return t;
        return TradeEntrySchema.parse({
          ...t,
          status: 'CLOSED',
          exitPrice,
          exitTimestamp: exitTimestamp ?? nowSec,
          updatedAt: nowSec,
        });
      });

      await repository.saveTrades(next);
      set({ trades: next });
    },

    updateTrade: async (id, updates) => {
      const nowSec = nowSecProvider();
      const current = get().trades;
      const next = current.map((t) => {
        if (t.id !== id) return t;
        return TradeEntrySchema.parse({
          ...t,
          ...updates,
          updatedAt: nowSec,
        });
      });

      await repository.saveTrades(next);
      set({ trades: next });
    },

    deleteTrade: async (id) => {
      const next = get().trades.filter((t) => t.id !== id);
      await repository.saveTrades(next);
      set((state) => ({
        trades: next,
        selectedTradeId:
          state.selectedTradeId === id ? null : state.selectedTradeId,
      }));
    },

    setFilterStatus: (filter) => {
      set({ filterStatus: filter });
    },

    toggleDrawer: (open) => {
      set((state) => ({
        isDrawerOpen: open !== undefined ? open : !state.isDrawerOpen,
      }));
    },

    selectTrade: (id) => {
      set({ selectedTradeId: id });
    },

    getTradesForTicker: (rawTicker) => {
      const ticker = TickerSymbolSchema.parse(rawTicker);
      return get().trades.filter((t) => t.ticker === ticker);
    },

    getSummary: () => {
      return calculateJournalSummary(get().trades);
    },
  }));
}
