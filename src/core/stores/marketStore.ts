import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MarketDataProvider } from '../providers/MarketDataProvider';
import {
  TickerSymbolSchema,
  TimeframeSchema,
  type OHLCVCandle,
  type TickerQuote,
  type TickerSearchResult,
  type Timeframe,
} from '../schemas/market';

export interface MarketState {
  providerId: string;
  activeTicker: string;
  activeTimeframe: Timeframe;
  quotesByTicker: Record<string, TickerQuote>;
  candlesByKey: Record<string, OHLCVCandle[]>;
  searchResults: TickerSearchResult[];
  isLoadingCandles: boolean;
  isLoadingQuotes: boolean;
  error: string | null;

  setProvider: (newProvider: MarketDataProvider) => Promise<void>;
  setActiveTicker: (ticker: string) => Promise<void>;
  setActiveTimeframe: (timeframe: Timeframe) => Promise<void>;
  refreshActiveCandles: () => Promise<OHLCVCandle[]>;
  refreshQuotes: (tickers: string[]) => Promise<void>;
  searchTickers: (query: string) => Promise<TickerSearchResult[]>;
}

export type MarketStore = StoreApi<MarketState>;

export function getCandleSeriesKey(ticker: string, timeframe: Timeframe): string {
  return `${ticker.toUpperCase()}:${timeframe}`;
}

/**
 * Headless Zustand store factory for market quotes, historical OHLCV candles,
 * and active symbol/timeframe state.
 */
export function createMarketStore(
  initialProvider: MarketDataProvider,
  initialTicker = 'AAPL',
  initialTimeframe: Timeframe = '1D'
): MarketStore {
  let provider = initialProvider;
  const normalizedInitialTicker = TickerSymbolSchema.parse(initialTicker);
  const validatedTimeframe = TimeframeSchema.parse(initialTimeframe);

  return createStore<MarketState>((set, get) => ({
    providerId: provider.id,
    activeTicker: normalizedInitialTicker,
    activeTimeframe: validatedTimeframe,
    quotesByTicker: {},
    candlesByKey: {},
    searchResults: [],
    isLoadingCandles: false,
    isLoadingQuotes: false,
    error: null,

    setProvider: async (newProvider: MarketDataProvider) => {
      provider = newProvider;
      set({
        providerId: provider.id,
        candlesByKey: {},
        error: null,
      });
      const existingTickers = Object.keys(get().quotesByTicker);
      const tickersToRefresh =
        existingTickers.length > 0 ? existingTickers : [get().activeTicker];
      await Promise.all([
        get().refreshActiveCandles(),
        get().refreshQuotes(tickersToRefresh),
      ]);
    },

    setActiveTicker: async (rawTicker: string) => {
      const ticker = TickerSymbolSchema.parse(rawTicker);
      set({ activeTicker: ticker, error: null });
      await Promise.all([
        get().refreshActiveCandles(),
        get().refreshQuotes([ticker]),
      ]);
    },

    setActiveTimeframe: async (rawTimeframe: Timeframe) => {
      const timeframe = TimeframeSchema.parse(rawTimeframe);
      set({ activeTimeframe: timeframe, error: null });
      await get().refreshActiveCandles();
    },

    refreshActiveCandles: async () => {
      const { activeTicker, activeTimeframe } = get();
      const seriesKey = getCandleSeriesKey(activeTicker, activeTimeframe);
      set({ isLoadingCandles: true, error: null });

      try {
        const candles = await provider.getCandles({
          ticker: activeTicker,
          timeframe: activeTimeframe,
          limit: 120,
        });
        set((state) => ({
          candlesByKey: {
            ...state.candlesByKey,
            [seriesKey]: candles,
          },
          isLoadingCandles: false,
        }));
        return candles;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load candles';
        set({ isLoadingCandles: false, error: message });
        return [];
      }
    },

    refreshQuotes: async (rawTickers: string[]) => {
      const uniqueTickers = Array.from(
        new Set(rawTickers.map((t) => TickerSymbolSchema.parse(t)))
      );
      if (uniqueTickers.length === 0) {
        return;
      }

      set({ isLoadingQuotes: true });
      try {
        const settled = await Promise.allSettled(
          uniqueTickers.map((t) => provider.getQuote(t))
        );
        const fulfilledQuotes: TickerQuote[] = [];
        let firstError: string | null = null;

        for (const res of settled) {
          if (res.status === 'fulfilled') {
            fulfilledQuotes.push(res.value);
          } else if (!firstError) {
            firstError =
              res.reason instanceof Error
                ? res.reason.message
                : 'Failed to refresh quote';
          }
        }

        set((state) => {
          const nextQuotes = { ...state.quotesByTicker };
          for (const quote of fulfilledQuotes) {
            nextQuotes[quote.ticker] = quote;
          }
          return {
            quotesByTicker: nextQuotes,
            isLoadingQuotes: false,
            error: fulfilledQuotes.length > 0 ? state.error : firstError,
          };
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to refresh quotes';
        set({ isLoadingQuotes: false, error: message });
      }
    },

    searchTickers: async (query: string) => {
      try {
        const results = await provider.searchTickers(query);
        set({ searchResults: results });
        return results;
      } catch {
        set({ searchResults: [] });
        return [];
      }
    },
  }));
}
