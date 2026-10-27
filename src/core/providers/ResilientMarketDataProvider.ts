import type {
  OHLCVCandle,
  TickerQuote,
  TickerSearchResult,
} from '../schemas/market';
import type {
  CandleQueryOptions,
  MarketDataProvider,
} from './MarketDataProvider';

/**
 * Decorator that wraps a primary MarketDataProvider with an automatic fallback provider.
 * Ensures that:
 * 1. Once the primary provider has succeeded at least once (`hasPrimaryEverSucceeded`),
 *    the session is known to be online with real market data—so it NEVER degrades to fake
 *    synthetic demo prices. Instead, it retries transient failures (e.g. HTTP 429) and
 *    returns `lastGoodQuotes` / `lastGoodCandles` if available.
 * 2. If the primary provider has never succeeded (e.g. offline mode or headless unit tests
 *    without a live proxy), or for endpoints unsupported on free tiers (e.g. Finnhub 403 candles),
 *    it transparently falls back to `fallback`.
 */
export class ResilientMarketDataProvider implements MarketDataProvider {
  private readonly primary: MarketDataProvider;
  private readonly fallback: MarketDataProvider;
  private readonly lastGoodQuotes = new Map<string, TickerQuote>();
  private readonly lastGoodCandles = new Map<string, OHLCVCandle[]>();
  private hasPrimaryQuoteSucceeded = false;
  private hasPrimaryCandlesSucceeded = false;

  constructor(primary: MarketDataProvider, fallback: MarketDataProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  public get id(): string {
    return `${this.primary.id}+${this.fallback.id}`;
  }

  public async getQuote(ticker: string): Promise<TickerQuote> {
    const key = ticker.trim().toUpperCase();
    try {
      const quote = await this.primary.getQuote(key);
      this.hasPrimaryQuoteSucceeded = true;
      this.lastGoodQuotes.set(key, quote);
      return quote;
    } catch (firstErr) {
      // If we are online (primary has worked before), retry once after a short delay
      if (this.hasPrimaryQuoteSucceeded) {
        try {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
          const retryQuote = await this.primary.getQuote(key);
          this.lastGoodQuotes.set(key, retryQuote);
          return retryQuote;
        } catch {
          const lastGood = this.lastGoodQuotes.get(key);
          if (lastGood) {
            return lastGood;
          }
          // Do NOT return fake demo quote when live primary is active
          throw firstErr;
        }
      }

      const lastGood = this.lastGoodQuotes.get(key);
      if (lastGood) {
        return lastGood;
      }
      return this.fallback.getQuote(key);
    }
  }

  public async getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]> {
    const key = `${options.ticker.trim().toUpperCase()}:${options.timeframe}:${options.limit ?? 120}`;
    try {
      const candles = await this.primary.getCandles(options);
      if (candles.length > 0) {
        this.hasPrimaryCandlesSucceeded = true;
        this.lastGoodCandles.set(key, candles);
        return candles;
      }
    } catch {
      if (this.hasPrimaryCandlesSucceeded) {
        try {
          await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
          const retryCandles = await this.primary.getCandles(options);
          if (retryCandles.length > 0) {
            this.lastGoodCandles.set(key, retryCandles);
            return retryCandles;
          }
        } catch {
          // Check lastGoodCandles below
        }
      }
    }
    const lastGood = this.lastGoodCandles.get(key);
    if (lastGood && lastGood.length > 0) {
      return lastGood;
    }
    return this.fallback.getCandles(options);
  }

  public async searchTickers(query: string): Promise<TickerSearchResult[]> {
    try {
      const results = await this.primary.searchTickers(query);
      if (results.length > 0) {
        return results;
      }
    } catch {
      // Fall through to fallback search
    }
    return this.fallback.searchTickers(query);
  }
}
