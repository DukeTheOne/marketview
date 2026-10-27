import { describe, expect, it, vi } from 'vitest';
import { DeterministicDemoProvider } from '../providers/DeterministicDemoProvider';
import type { HttpFetcher } from '../providers/FinnhubProvider';
import type { MarketDataProvider } from '../providers/MarketDataProvider';
import { ResilientMarketDataProvider } from '../providers/ResilientMarketDataProvider';
import { YahooFinanceProvider } from '../providers/YahooFinanceProvider';
import { createMarketStore, getCandleSeriesKey } from '../stores/marketStore';

describe('YahooFinanceProvider', () => {
  it('parses getQuote from Yahoo Finance v8 chart endpoint', async () => {
    const requestedUrls: string[] = [];
    const mockFetcher: HttpFetcher = async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            chart: {
              result: [
                {
                  meta: {
                    symbol: 'AAPL',
                    regularMarketPrice: 229.45,
                    chartPreviousClose: 225.0,
                    regularMarketDayHigh: 231.1,
                    regularMarketDayLow: 226.2,
                    regularMarketTime: 1711999200,
                  },
                  indicators: {
                    quote: [
                      {
                        open: [224.0, null, 226.8],
                        high: [226.5, null, 231.1],
                        low: [223.8, null, 226.2],
                        close: [225.0, null, 229.45],
                        volume: [45000000, null, 52000000],
                      },
                    ],
                  },
                },
              ],
              error: null,
            },
          };
        },
      };
    };

    const provider = new YahooFinanceProvider(
      mockFetcher,
      'https://query1.finance.yahoo.com'
    );
    const quote = await provider.getQuote('aapl');

    expect(requestedUrls[0]).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d'
    );
    expect(quote).toEqual({
      ticker: 'AAPL',
      price: 229.45,
      previousClose: 225,
      change: 4.45,
      changePercent: 1.98,
      high: 231.1,
      low: 226.2,
      open: 226.8,
      timestamp: 1711999200,
    });
  });

  it('parses getCandles, skips null gap bars, and slices to limit', async () => {
    const requestedUrls: string[] = [];
    const mockFetcher: HttpFetcher = async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            chart: {
              result: [
                {
                  meta: {
                    symbol: 'NVDA',
                    regularMarketPrice: 135.5,
                  },
                  timestamp: [1711900000, 1711900900, 1711901800, 1711902700],
                  indicators: {
                    quote: [
                      {
                        open: [130.0, null, 132.5, 134.0],
                        high: [131.5, null, 134.2, 136.0],
                        low: [129.5, null, 131.8, 133.5],
                        close: [131.0, null, 133.9, 135.5],
                        volume: [1200000, null, null, 1850000],
                      },
                    ],
                  },
                },
              ],
            },
          };
        },
      };
    };

    const provider = new YahooFinanceProvider(mockFetcher, '/api/yahoo');
    const candles = await provider.getCandles({
      ticker: 'nvda',
      timeframe: '15m',
      limit: 2,
    });

    expect(requestedUrls[0]).toBe(
      '/api/yahoo/v8/finance/chart/NVDA?interval=15m&range=5d'
    );
    expect(candles).toHaveLength(2);
    expect(candles[0]).toEqual({
      timestamp: 1711901800,
      open: 132.5,
      high: 134.2,
      low: 131.8,
      close: 133.9,
      volume: 0,
    });
    expect(candles[1]).toEqual({
      timestamp: 1711902700,
      open: 134.0,
      high: 136.0,
      low: 133.5,
      close: 135.5,
      volume: 1850000,
    });
  });

  it('parses searchTickers and filters non-standard symbols', async () => {
    const mockFetcher: HttpFetcher = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          quotes: [
            {
              symbol: 'MSFT',
              shortname: 'Microsoft Corporation',
              exchDisp: 'NASDAQ',
            },
            {
              symbol: 'BRK.B',
              longname: 'Berkshire Hathaway Inc.',
              exchange: 'NYQ',
            },
            {
              symbol: 'BTC-USD', // filtered out by /^[A-Z.]{1,12}$/
              shortname: 'Bitcoin USD',
              exchDisp: 'CCC',
            },
          ],
        };
      },
    });

    const provider = new YahooFinanceProvider(mockFetcher);
    const results = await provider.searchTickers('ms');

    expect(results).toEqual([
      {
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        exchange: 'NASDAQ',
      },
      {
        ticker: 'BRK.B',
        name: 'Berkshire Hathaway Inc.',
        exchange: 'NYQ',
      },
    ]);
  });
});

describe('ResilientMarketDataProvider & MarketStore hot-swapping', () => {
  it('falls back to secondary provider when primary throws or returns empty candles', async () => {
    const demoFallback = new DeterministicDemoProvider();
    const failingPrimary: MarketDataProvider = {
      id: 'failing-primary',
      getQuote: vi.fn().mockRejectedValue(new Error('HTTP 403 Forbidden')),
      getCandles: vi.fn().mockResolvedValue([]),
      searchTickers: vi.fn().mockRejectedValue(new Error('Network offline')),
    };

    const resilient = new ResilientMarketDataProvider(
      failingPrimary,
      demoFallback
    );

    expect(resilient.id).toBe('failing-primary+deterministic-demo');

    const quote = await resilient.getQuote('AAPL');
    expect(quote.ticker).toBe('AAPL');
    expect(quote.price).toBeGreaterThan(0);

    const candles = await resilient.getCandles({
      ticker: 'AAPL',
      timeframe: '1D',
      limit: 10,
    });
    expect(candles).toHaveLength(10);

    const search = await resilient.searchTickers('NVDA');
    expect(search.some((item) => item.ticker === 'NVDA')).toBe(true);
  });

  it('hot-swaps providers cleanly via createMarketStore.setProvider', async () => {
    const demoProvider = new DeterministicDemoProvider();
    const store = createMarketStore(demoProvider, 'AAPL', '1D');

    await store.getState().refreshActiveCandles();
    expect(store.getState().providerId).toBe('deterministic-demo');

    const mockYahooFetcher: HttpFetcher = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          chart: {
            result: [
              {
                meta: {
                  symbol: 'AAPL',
                  regularMarketPrice: 250.0,
                  chartPreviousClose: 245.0,
                  regularMarketDayHigh: 252.0,
                  regularMarketDayLow: 244.0,
                  regularMarketTime: 1712000000,
                },
                timestamp: [1711900000, 1712000000],
                indicators: {
                  quote: [
                    {
                      open: [244.0, 246.0],
                      high: [247.0, 252.0],
                      low: [243.5, 245.5],
                      close: [245.0, 250.0],
                      volume: [30000000, 40000000],
                    },
                  ],
                },
              },
            ],
          },
        };
      },
    });

    const yahooProvider = new YahooFinanceProvider(mockYahooFetcher);
    await store.getState().setProvider(yahooProvider);

    const state = store.getState();
    expect(state.providerId).toBe('yahoo-finance');
    expect(state.quotesByTicker['AAPL']?.price).toBe(250.0);
    const candles = state.candlesByKey[getCandleSeriesKey('AAPL', '1D')];
    expect(candles).toHaveLength(2);
    expect(candles?.[1]?.close).toBe(250.0);
  });

  it('never reverts real prices back to fake demo prices when primary hits a transient 429 error after succeeding', async () => {
    const demoFallback = new DeterministicDemoProvider();
    let shouldFail = false;

    const flakyLivePrimary: MarketDataProvider = {
      id: 'flaky-yahoo',
      getQuote: vi.fn(async (ticker: string) => {
        if (shouldFail) {
          throw new Error('Yahoo Finance quote request failed (429)');
        }
        return {
          ticker,
          price: 234.56,
          change: 3.12,
          changePercent: 1.35,
          high: 236.0,
          low: 231.0,
          open: 232.0,
          previousClose: 231.44,
          timestamp: 1712000000,
        };
      }),
      getCandles: vi.fn().mockResolvedValue([]),
      searchTickers: vi.fn().mockResolvedValue([]),
    };

    const resilient = new ResilientMarketDataProvider(
      flakyLivePrimary,
      demoFallback
    );

    // First refresh succeeds with real price ($234.56, NOT demo $210.22)
    const firstQuote = await resilient.getQuote('AAPL');
    expect(firstQuote.price).toBe(234.56);

    // Subsequent refresh hits 429 rate limit
    shouldFail = true;
    const secondQuote = await resilient.getQuote('AAPL');
    // Must preserve the real $234.56 price, never reverting to fake demo $210.22
    expect(secondQuote.price).toBe(234.56);
  });
});
