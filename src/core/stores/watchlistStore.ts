import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StorageRepository } from '../repositories/StorageRepository';
import { TickerSymbolSchema } from '../schemas/market';
import { WatchlistSchema, type Watchlist } from '../schemas/watchlist';

export interface WatchlistState {
  watchlists: Watchlist[];
  activeWatchlistId: string;
  isHydrated: boolean;

  hydrate: () => Promise<Watchlist[]>;
  selectWatchlist: (id: string) => void;
  createWatchlist: (name: string, initialTickers?: string[]) => Promise<Watchlist>;
  renameWatchlist: (id: string, newName: string) => Promise<void>;
  deleteWatchlist: (id: string) => Promise<void>;
  addTicker: (watchlistId: string, ticker: string) => Promise<void>;
  removeTicker: (watchlistId: string, ticker: string) => Promise<void>;
}

export type WatchlistStore = StoreApi<WatchlistState>;

function createDefaultWatchlists(nowSec: number): Watchlist[] {
  return [
    WatchlistSchema.parse({
      id: 'wl-core-leaders',
      name: 'Core Tech & Index Leaders',
      tickers: ['AAPL', 'NVDA', 'MSFT', 'SPY', 'QQQ'],
      createdAt: nowSec,
      updatedAt: nowSec,
    }),
    WatchlistSchema.parse({
      id: 'wl-high-beta',
      name: 'High Beta Momentum',
      tickers: ['TSLA', 'META', 'AMD', 'AMZN', 'GOOGL'],
      createdAt: nowSec,
      updatedAt: nowSec,
    }),
  ];
}

/**
 * Headless Zustand store factory for multi-watchlist CRUD persisted through StorageRepository.
 */
export function createWatchlistStore(
  repository: StorageRepository,
  nowSecProvider: () => number = () => Math.floor(Date.now() / 1000)
): WatchlistStore {
  return createStore<WatchlistState>((set, get) => ({
    watchlists: [],
    activeWatchlistId: '',
    isHydrated: false,

    hydrate: async () => {
      const existing = await repository.getWatchlists();
      if (existing.length > 0) {
        const firstId = existing[0]?.id ?? '';
        set({
          watchlists: existing,
          activeWatchlistId: get().activeWatchlistId || firstId,
          isHydrated: true,
        });
        return existing;
      }

      const seeded = createDefaultWatchlists(nowSecProvider());
      await repository.saveWatchlists(seeded);
      set({
        watchlists: seeded,
        activeWatchlistId: seeded[0]?.id ?? '',
        isHydrated: true,
      });
      return seeded;
    },

    selectWatchlist: (id: string) => {
      const exists = get().watchlists.some((w) => w.id === id);
      if (exists) {
        set({ activeWatchlistId: id });
      }
    },

    createWatchlist: async (name: string, initialTickers: string[] = []) => {
      const nowSec = nowSecProvider();
      const id = `wl-${nowSec}-${Math.random().toString(36).slice(2, 7)}`;
      const newWatchlist = WatchlistSchema.parse({
        id,
        name,
        tickers: initialTickers.map((t) => TickerSymbolSchema.parse(t)),
        createdAt: nowSec,
        updatedAt: nowSec,
      });

      const next = [...get().watchlists, newWatchlist];
      await repository.saveWatchlists(next);
      set({
        watchlists: next,
        activeWatchlistId: newWatchlist.id,
      });
      return newWatchlist;
    },

    renameWatchlist: async (id: string, newName: string) => {
      const nowSec = nowSecProvider();
      const next = get().watchlists.map((w) =>
        w.id === id
          ? WatchlistSchema.parse({
              ...w,
              name: newName,
              updatedAt: nowSec,
            })
          : w
      );
      await repository.saveWatchlists(next);
      set({ watchlists: next });
    },

    deleteWatchlist: async (id: string) => {
      const current = get().watchlists;
      if (current.length <= 1) {
        // Keep at least one watchlist active
        return;
      }
      const next = current.filter((w) => w.id !== id);
      await repository.saveWatchlists(next);
      const nextActiveId =
        get().activeWatchlistId === id ? (next[0]?.id ?? '') : get().activeWatchlistId;
      set({
        watchlists: next,
        activeWatchlistId: nextActiveId,
      });
    },

    addTicker: async (watchlistId: string, rawTicker: string) => {
      const ticker = TickerSymbolSchema.parse(rawTicker);
      const nowSec = nowSecProvider();
      const next = get().watchlists.map((w) => {
        if (w.id !== watchlistId) {
          return w;
        }
        if (w.tickers.includes(ticker)) {
          return w;
        }
        return WatchlistSchema.parse({
          ...w,
          tickers: [...w.tickers, ticker],
          updatedAt: nowSec,
        });
      });

      await repository.saveWatchlists(next);
      set({ watchlists: next });
    },

    removeTicker: async (watchlistId: string, rawTicker: string) => {
      const ticker = TickerSymbolSchema.parse(rawTicker);
      const nowSec = nowSecProvider();
      const next = get().watchlists.map((w) => {
        if (w.id !== watchlistId) {
          return w;
        }
        return WatchlistSchema.parse({
          ...w,
          tickers: w.tickers.filter((t) => t !== ticker),
          updatedAt: nowSec,
        });
      });

      await repository.saveWatchlists(next);
      set({ watchlists: next });
    },
  }));
}
