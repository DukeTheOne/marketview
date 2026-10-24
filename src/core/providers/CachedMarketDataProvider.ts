import {
  OHLCVCandleSchema,
  TickerQuoteSchema,
  TickerSearchResultSchema,
  TickerSymbolSchema,
  type OHLCVCandle,
  type TickerQuote,
  type TickerSearchResult,
} from '../schemas/market';
import type {
  CandleQueryOptions,
  MarketDataProvider,
} from './MarketDataProvider';

export class RateLimitExceededError extends Error {
  constructor(providerId: string, maxRequestsPerMinute: number) {
    super(
      `Rate limit exceeded for provider "${providerId}" (max ${maxRequestsPerMinute} requests per minute).`
    );
    this.name = 'RateLimitExceededError';
  }
}

export interface CachedProviderConfig {
  quoteTtlMs?: number;
  candlesTtlMs?: number;
  searchTtlMs?: number;
  maxRequestsPerMinute?: number;
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Decorator around any MarketDataProvider that enforces:
 * 1. TTL caching per resource type (quote, candles, search)
 * 2. In-flight Promise deduplication for identical concurrent calls
 * 3. Sliding-window rate limiting to protect free-tier API quotas
 * 4. Stale-cache fallback if rate limit is reached and a previous value exists
 * 5. Strict Zod output validation at the provider boundary
 */
export class CachedMarketDataProvider implements MarketDataProvider {
  public readonly id: string;
  private readonly inner: MarketDataProvider;
  private readonly quoteTtlMs: number;
  private readonly candlesTtlMs: number;
  private readonly searchTtlMs: number;
  private readonly maxRequestsPerMinute: number;
  private readonly now: () => number;

  private readonly quoteCache = new Map<string, CacheEntry<TickerQuote>>();
  private readonly candleCache = new Map<string, CacheEntry<OHLCVCandle[]>>();
  private readonly searchCache = new Map<string, CacheEntry<TickerSearchResult[]>>();

  private readonly inFlight = new Map<string, Promise<unknown>>();
  private requestTimestamps: number[] = [];

  constructor(inner: MarketDataProvider, config: CachedProviderConfig = {}) {
    this.inner = inner;
    this.id = `cached:${inner.id}`;
    this.quoteTtlMs = config.quoteTtlMs ?? 15_000;
    this.candlesTtlMs = config.candlesTtlMs ?? 60_000;
    this.searchTtlMs = config.searchTtlMs ?? 300_000;
    this.maxRequestsPerMinute = config.maxRequestsPerMinute ?? 55;
    this.now = config.now ?? (() => Date.now());
  }

  public async getQuote(rawTicker: string): Promise<TickerQuote> {
    const ticker = TickerSymbolSchema.parse(rawTicker);
    const cacheKey = `quote:${ticker}`;
    const existing = this.quoteCache.get(cacheKey);
    const currentTime = this.now();

    if (existing && existing.expiresAt > currentTime) {
      return existing.value;
    }

    return this.executeWithDedupAndRateLimit<TickerQuote>(
      cacheKey,
      existing?.value,
      async () => {
        const rawQuote = await this.inner.getQuote(ticker);
        const validated = TickerQuoteSchema.parse(rawQuote);
        this.quoteCache.set(cacheKey, {
          value: validated,
          expiresAt: this.now() + this.quoteTtlMs,
        });
        return validated;
      }
    );
  }

  public async getCandles(options: CandleQueryOptions): Promise<OHLCVCandle[]> {
    const ticker = TickerSymbolSchema.parse(options.ticker);
    const limit = options.limit ?? 120;
    const cacheKey = `candles:${ticker}:${options.timeframe}:${limit}`;
    const existing = this.candleCache.get(cacheKey);
    const currentTime = this.now();

    if (existing && existing.expiresAt > currentTime) {
      return existing.value;
    }

    return this.executeWithDedupAndRateLimit<OHLCVCandle[]>(
      cacheKey,
      existing?.value,
      async () => {
        const rawCandles = await this.inner.getCandles({
          ticker,
          timeframe: options.timeframe,
          limit,
        });
        const validated = rawCandles.map((c) => OHLCVCandleSchema.parse(c));
        this.candleCache.set(cacheKey, {
          value: validated,
          expiresAt: this.now() + this.candlesTtlMs,
        });
        return validated;
      }
    );
  }

  public async searchTickers(query: string): Promise<TickerSearchResult[]> {
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) {
      return [];
    }
    const cacheKey = `search:${normalizedQuery}`;
    const existing = this.searchCache.get(cacheKey);
    const currentTime = this.now();

    if (existing && existing.expiresAt > currentTime) {
      return existing.value;
    }

    return this.executeWithDedupAndRateLimit<TickerSearchResult[]>(
      cacheKey,
      existing?.value,
      async () => {
        const rawResults = await this.inner.searchTickers(normalizedQuery);
        const validated = rawResults.map((r) => TickerSearchResultSchema.parse(r));
        this.searchCache.set(cacheKey, {
          value: validated,
          expiresAt: this.now() + this.searchTtlMs,
        });
        return validated;
      }
    );
  }

  public clearCache(): void {
    this.quoteCache.clear();
    this.candleCache.clear();
    this.searchCache.clear();
  }

  private async executeWithDedupAndRateLimit<T>(
    key: string,
    staleFallback: T | undefined,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const activePromise = this.inFlight.get(key) as Promise<T> | undefined;
    if (activePromise) {
      return activePromise;
    }

    const currentTime = this.now();
    const windowStart = currentTime - 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);

    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      if (staleFallback !== undefined) {
        return staleFallback;
      }
      throw new RateLimitExceededError(this.inner.id, this.maxRequestsPerMinute);
    }

    this.requestTimestamps.push(currentTime);

    const promise = fetcher().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}
