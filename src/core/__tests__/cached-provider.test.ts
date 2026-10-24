import { describe, expect, it, vi } from 'vitest';
import {
  CachedMarketDataProvider,
  RateLimitExceededError,
} from '../providers/CachedMarketDataProvider';
import { DeterministicDemoProvider } from '../providers/DeterministicDemoProvider';
import { FinnhubProvider } from '../providers/FinnhubProvider';
import type { MarketDataProvider } from '../providers/MarketDataProvider';

describe('MarketDataProvider Adapter & Rate-Limit Cache (TC-03)', () => {
  it('returns cached quotes within TTL without hitting the underlying provider twice', async () => {
    let clockMs = 1_000_000;
    const demo = new DeterministicDemoProvider();
    const getQuoteSpy = vi.spyOn(demo, 'getQuote');

    const cached = new CachedMarketDataProvider(demo, {
      quoteTtlMs: 15_000,
      now: () => clockMs,
    });

    const first = await cached.getQuote('aapl');
    const second = await cached.getQuote('AAPL');

    expect(first.ticker).toBe('AAPL');
    expect(second).toEqual(first);
    expect(getQuoteSpy).toHaveBeenCalledTimes(1);

    // Advance clock past TTL
    clockMs += 16_000;
    await cached.getQuote('AAPL');
    expect(getQuoteSpy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent in-flight candle requests for the same key', async () => {
    const demo = new DeterministicDemoProvider();
    const getCandlesSpy = vi.spyOn(demo, 'getCandles');

    const cached = new CachedMarketDataProvider(demo, {
      candlesTtlMs: 60_000,
    });

    const [c1, c2, c3] = await Promise.all([
      cached.getCandles({ ticker: 'NVDA', timeframe: '1D', limit: 30 }),
      cached.getCandles({ ticker: 'nvda', timeframe: '1D', limit: 30 }),
      cached.getCandles({ ticker: 'NVDA', timeframe: '1D', limit: 30 }),
    ]);

    expect(c1.length).toBe(30);
    expect(c2).toEqual(c1);
    expect(c3).toEqual(c1);
    expect(getCandlesSpy).toHaveBeenCalledTimes(1);
  });

  it('serves stale cached quote when rate limit is exceeded, and throws RateLimitExceededError when no stale cache exists', async () => {
    let clockMs = 5_000_000;
    const demo = new DeterministicDemoProvider();
    const cached = new CachedMarketDataProvider(demo, {
      quoteTtlMs: 5_000,
      maxRequestsPerMinute: 2,
      now: () => clockMs,
    });

    const aaplQuote = await cached.getQuote('AAPL'); // Request 1
    await cached.getQuote('MSFT'); // Request 2 (quota now full for this minute)

    // Advance past quote TTL (6s), still within 60s rate-limit window
    clockMs += 6_000;

    // AAPL has a stale value in cache -> returns stale fallback gracefully
    const fallbackQuote = await cached.getQuote('AAPL');
    expect(fallbackQuote).toEqual(aaplQuote);

    // TSLA has no stale cache -> throws typed RateLimitExceededError
    await expect(cached.getQuote('TSLA')).rejects.toBeInstanceOf(
      RateLimitExceededError
    );
  });

  it('normalizes external Finnhub REST payloads through Zod schemas', async () => {
    const mockFetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        c: 231.45,
        d: 3.2,
        dp: 1.4,
        h: 233.0,
        l: 228.1,
        o: 229.0,
        pc: 228.25,
        t: 1729728000,
      }),
    }));

    const provider: MarketDataProvider = new FinnhubProvider(
      'test-key',
      mockFetcher
    );
    const quote = await provider.getQuote('aapl');

    expect(quote).toEqual({
      ticker: 'AAPL',
      price: 231.45,
      change: 3.2,
      changePercent: 1.4,
      high: 233.0,
      low: 228.1,
      open: 229.0,
      previousClose: 228.25,
      timestamp: 1729728000,
    });
  });
});
