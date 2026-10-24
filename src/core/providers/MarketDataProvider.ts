import type {
  OHLCVCandle,
  TickerQuote,
  TickerSearchResult,
  Timeframe,
} from '../schemas/market';

export interface CandleQueryOptions {
  ticker: string;
  timeframe: Timeframe;
  limit?: number;
}

/**
 * Headless port interface for market data providers.
 * UI components and stores must never call external APIs directly;
 * all market data flows through this contract wrapped by CachedMarketDataProvider.
 */
export interface MarketDataProvider {
  readonly id: string;
  getQuote(ticker: string): Promise<TickerQuote>;
  getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]>;
  searchTickers(query: string): Promise<TickerSearchResult[]>;
}
